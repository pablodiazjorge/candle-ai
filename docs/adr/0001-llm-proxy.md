# ADR 0001: LLM proxy - why it exists and what it validates

**Status.** Accepted, 2026-10-21.

This is the first standalone record in `docs/adr/`. ADR-001 to ADR-017 stay inline in
[`docs/architecture.md`](../architecture.md). This record replaces the "Production CORS proxy"
paragraph of ADR-003 and the "LLM CORS proxy" entry of "Known Limitations" there.

**Context.**
Most cloud LLM APIs (OpenAI, DeepSeek, Groq, Together AI...) do not send CORS headers, so the
browser cannot call them from `candle-ai.pablodiazjorge.com`. Local providers (Ollama, llama.cpp)
do not have this problem: the browser calls `localhost` directly and never goes through Vercel.

The first version of the proxy (June 2026), one catch-all function in `api/llm/`, checked the
`X-Target-Base-URL` header with `startsWith` against a list that also had `http://localhost` and
`http://127.0.0.1`. It accepted `https://api.openai.com.evil.com` and
`https://api.openai.com@evil.com`, forwarded every request header, followed redirects, read
bodies of any size, answered with CORS `*` and echoed the target URL and `err.message` in its
errors. In practice it was an open proxy running inside Vercel's network (SSRF).

**Options considered.**

A. No proxy. Cloud providers would only work on localhost. In production the default preset is
DeepSeek, so this removes the LLM layer for anyone who does not run a local model.

B. A generic proxy with a prefix check (the first version). Rejected for the reasons above.

C. A narrow proxy: same origin only, an exact allowlist of provider hosts, base paths and
endpoints, a small set of forwarded headers, and a rate limit per IP.

D. A backend that keeps the key on the server. The app has no accounts and users bring their own
key, so there is no server-side key to keep.

**Decision.**
Option C. The proxy is one Vercel Node.js Function per allowed endpoint, `api/llm/models.js` and
`api/llm/chat/completions.js`, each with its route fixed in the file. They share the logic in
`api/llm/_proxy.js`, with the validation in `api/llm/_target.js` (`resolveTarget()`, pure and unit
tested). Files in `api/` that start with `_` are not deployed as functions. There is no catch-all because Vercel does not support `[...param]` files
outside Next.js: the catch-all only matched one path segment and got an empty route, so
`/api/llm/chat/completions` answered 404 and `/api/llm/models` answered 403, as seen in production
on 2026-10-21.

What `resolveTarget()` accepts:

| Host (exact) | Base path (exact) |
|---|---|
| `api.deepseek.com` | `/v1` or none |
| `api.openai.com` | `/v1` |
| `api.groq.com` | `/openai/v1` |
| `api.together.xyz` | `/v1` |
| `openrouter.ai` | `/api/v1` |
| `api.mistral.ai` | `/v1` |
| `api.anthropic.com` | `/v1` |
| `generativelanguage.googleapis.com` | `/v1beta/openai` |

plus one of two endpoints: `/models` (the health check, GET) or `/chat/completions` (POST). The
base URL is parsed with `new URL()`, which lowercases the host, turns non-ASCII hosts into
punycode, drops the default port and resolves `.` and `..` segments before any check.

What it rejects, and why:

| Input | Why |
|---|---|
| `https://api.openai.com.evil.com`, `https://evil.api.openai.com`, `https://api.openai.com.` | The host must match exactly; a prefix or suffix check is the bug this record fixes. |
| `https://api.openai.com@evil.com`, any user or password | With userinfo the real host is the one after `@`. |
| `http:`, `file:`, `data:`, any scheme but `https:` | The key would travel in clear or the URL would not reach a provider. |
| An explicit port (`:8443`, `:80`) | Only the default 443 of the provider. |
| `localhost`, `127.0.0.1`, `[::1]`, IPs in any notation | The function runs in Vercel's network, not on the user's machine; local addresses only serve to probe internal services. Local providers are called directly by the browser. |
| Hosts with look-alike letters (`аpi.openai.com` with a Cyrillic `а`) | `new URL()` turns them into punycode (`xn--...`), which is not in the list. |
| A raw value with `%` or `\` | No provider base URL needs them; they are the usual way to smuggle encoded dots, slashes or hosts. |
| A base path other than the provider's API root | `new URL()` turns `/v1/%2e%2e/admin` into `/admin` before any check, so only an exact base path stops it. |
| Route segments `.`, `..`, or with `/`, `\`, `?`, `#`, `%` | Traversal, also encoded (`%2e%2e`). |
| Any other endpoint (`/files`, `/embeddings`...) | The app only uses two. |
| A query string or a fragment in the base URL | Not needed, and a place to hide a second URL. |

What the handler does:

- Accepts GET and POST only; anything else, OPTIONS included, gets 405. The app calls the proxy
  from the same origin, so there is no preflight and no CORS header in any response.
- Forwards only `content-type`, `accept` and `authorization: Bearer <X-Target-API-Key>`. Cookies,
  `origin`, `x-forwarded-*` and the `X-Target-*` headers never reach the provider.
- Calls the provider with `redirect: 'error'`, so a redirect cannot take the request to another host.
- Reads at most 256 KB of body, counted in bytes and also checked against `Content-Length`; over
  that it answers 413. The app sends a few KB.
- Answers with generic errors (403 "Target not allowed", 413, 502 "Upstream request failed")
  that never echo the input or `err.message`. It logs the provider host and the error for the
  owner, never the headers, because they carry the key. Responses are `cache-control: no-store`.
- Passes the provider's status and body through, so a 401 for a bad key reaches the app as is.

Rate limit. The limit is not in the code. It is a Vercel Firewall rule, `llm-proxy rate limit`:
Request Path starts with `/api/llm/`, fixed window 60 s, 20 requests per IP, action 429;
configured in the Vercel dashboard. The firewall applies it at the edge, before the request
reaches the function, so every request to the proxy counts, valid or not, and over the limit
the function never runs.

**Rationale.**
A counter in memory does not work in serverless functions: each instance keeps its own. The
Vercel Firewall keeps the counter at the edge, is available on the Hobby plan (one rate limit rule
per project) and needs no new account, unlike a hosted Redis. `vercel.json` can only deny or
challenge requests, not rate limit them, so the rule is configured in the dashboard or with
`vercel firewall rules add`. The allowlist is the security boundary; the limit protects cost
and abuse.

The first version of this limit called `checkRateLimit()` from `@vercel/firewall` inside the
function. In production, on 2026-10-21, those checks never limited anything: the rule counted
correctly when its API was called from outside, but the checks made by the function always got
a 204 and 25 requests in a row gave no 429. A rule on the path is applied at the edge, adds no
call per request and does not depend on a rate limit key the client could forge, so the package
was dropped.

**Consequences and what it does not cover.**

- The key and the analysis context pass through the function, in memory, on their way to the
  provider. They are not logged or stored, but the user trusts this deployment and Vercel with them.
  Local providers avoid the proxy entirely.
- It is still a relay for the allowed providers: anyone can use it with their own key to call
  those two endpoints. The rate limit caps that per IP; it does not stop abuse spread over many
  IPs, and Vercel counts per region, so traffic from several regions can go over the limit.
- The rule lives only in the Vercel dashboard, not in the repository. If it is removed or
  disabled there is no rate limit at all, and nothing in the code notices.
- Adding a provider means adding its host and base path to `_target.js` and a test. A custom
  provider outside the list works on localhost, if it sends CORS headers, but not in production.
  Adding an endpoint means adding it to `ALLOWED_PATHS` in `_target.js` and a file under
  `api/llm/` that calls `proxy()` with its route.
- No streaming: the provider's response is read whole and sent back.
- There is no end-to-end test against a deployed function yet. The closing check after each deploy
  is that these two requests answer 403 (a 404 means the function is not deployed at that path):

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://candle-ai.pablodiazjorge.com/api/llm/chat/completions \
    -H "X-Target-Base-URL: https://api.openai.com.evil.com"
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://candle-ai.pablodiazjorge.com/api/llm/chat/completions \
    -H "X-Target-Base-URL: https://api.openai.com@evil.com"
  ```

Tests: `api/llm/_target.test.js` (attack cases) and `api/llm/_handler.test.js`
(`_proxy.js` and the two endpoint files, simulated request and response, mocked `fetch`). The
rate limit is not covered by tests: it lives in the Vercel Firewall, outside the repository.
