---
name: track-tokens
description: |
  Token usage and cost tracking for AI coding sessions. Use at the START of a
  session ("track my tokens", "start tracking") or END ("show token usage",
  "what did this cost", "session summary"). Queries session_store_sql for
  token data and estimates costs. Also invokeable via PowerShell scripts at
  session boundaries.
disable-model-invocation: false
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.0"
  tokens: "1.2k"
---

# Track Tokens — Session Cost & Usage

## Trigger

- **Start of session**: user says "start tracking", "begin session", or agent auto-invokes
- **End of session**: user says "show token usage", "session cost", "summarize tokens", "track-tokens"

## Algorithm

### At Session Start

1. Run `scripts/session-start.ps1` to log session begin timestamp
2. Note the PowerShell terminal output — it confirms the log file was created

### At Session End

#### Step 1 — Query session_store_sql

Use the `session_store_sql` tool to query the current session:

```sql
SELECT
  s.id as session_id,
  s.created_at,
  COUNT(t.id) as turn_count
FROM sessions s
LEFT JOIN turns t ON t.session_id = s.id
WHERE s.id = (SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1)
GROUP BY s.id, s.created_at
```

Also try to get message counts (if the schema supports it):

```sql
SELECT
  COUNT(*) as total_turns,
  SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_messages,
  SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_messages
FROM turns
WHERE session_id = (SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1)
```

#### Step 2 — Estimate Tokens

If `session_store_sql` yields token data, use it directly. Otherwise, estimate:

| Source | Estimation Method | Factor |
|--------|-------------------|--------|
| Chat text (input) | char count ÷ 4 | ~0.25 tokens/char |
| Chat text (output) | char count ÷ 3.5 | ~0.29 tokens/char |
| Cached tokens | ~50% of input tokens (typical for system prompts + skills) | 0.5× |
| File reads | char count of files read ÷ 4 | 0.25 tokens/char |
| Tool outputs | char count ÷ 4 | 0.25 tokens/char |

#### Step 3 — Calculate Cost

Apply provider-appropriate pricing. Default: DeepSeek V3 pricing.

| Provider | Input $/1M tokens | Output $/1M tokens | Cached $/1M tokens |
|----------|-------------------|--------------------|--------------------|
| **OpenAI** | | | |
| GPT-5.5 | $5.00 | $30.00 | $0.50 |
| GPT-5.4 | $2.50 | $15.00 | $0.25 |
| GPT-5.4 Mini | $0.75 | $4.50 | $0.075 |
| **Anthropic** | | | |
| Claude Fable 5 | $10.00 | $50.00 | $1.00 |
| Claude Opus 4.8 | $5.00 | $25.00 | $0.50 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 |
| **DeepSeek** | | | |
| DeepSeek V4 Flash | $0.14 | $0.28 | $0.0028 |
| DeepSeek V4 Pro | $0.435 | $0.87 | $0.003625 |
| **Kimi / Moonshot** | | | |
| Kimi K2.7 Code | $0.90 | $3.73 | $0.18 |
| Kimi K2.6 | $0.90 | $3.73 | $0.15 |
| **MiniMax** | | | |
| MiniMax-M3 | $0.30 | $1.20 | $0.06 |
| MiniMax-M2.7 | $0.30 | $1.20 | $0.06 |
| **GitHub Copilot** | Included in subscription | | |

Formula:
```
cost = (input_tokens / 1_000_000 * INPUT_PRICE)
     + (output_tokens / 1_000_000 * OUTPUT_PRICE)
     + (cached_tokens / 1_000_000 * CACHED_PRICE)
```

#### Step 4 — Log and Report

Run `scripts/session-end.ps1` with token estimates (if PowerShell is available).

Output format:

```
## Session Token Report — 2026-06-24

| Metric | Count | Cost |
|--------|-------|------|
| 📥 Input tokens | 12,450 | $0.003 |
| 📤 Output tokens | 8,200 | $0.009 |
| ⚡ Cached tokens | 6,225 | $0.0004 |
| 💬 Turns | 14 | — |
| 📁 Files read | 22 | — |
| **Total** | **26,875** | **$0.012** |

💰 Session cost: ~$0.012 (DeepSeek V3 pricing)
📊 Tokens saved by skills: ~4,200 (vs. no-skill baseline)
```

#### Step 5 — Persist to Memory (Optional)

If the user wants cumulative tracking across sessions, log to `/memories/repo/token-usage.md`:

```markdown
## 2026-06-24
- Session: abc123
- Input: 12,450 tokens
- Output: 8,200 tokens
- Cached: 6,225 tokens
- Cost: $0.012
- Provider: DeepSeek V3
```

## Limitations

1. **GitHub Copilot in VS Code does NOT expose `usage.prompt_tokens`** in the chat
   interface. All numbers are estimates unless the backend provides them.

2. **Cached tokens are an approximation** — actual cache hit rates depend on
   prompt prefix matching.

3. **File read tokens are NOT double-counted** — when the agent reads a file,
   those tokens are part of input tokens, not additional.

4. **For precise token tracking**, use the OpenAI-compatible API directly
   (where `usage.prompt_tokens` is in the response) rather than Copilot.

## File Paths Reference

| Resource | Path |
|----------|------|
| Session start script | `scripts/session-start.ps1` |
| Session end script | `scripts/session-end.ps1` |
| Token usage log | `/memories/repo/token-usage.md` (optional) |
| Session DB | `session_store_sql` (VS Code internal) |
