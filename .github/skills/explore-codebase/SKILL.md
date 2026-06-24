---
name: explore-codebase
description: |
  Efficient codebase exploration patterns for AI coding agents. Use when entering
  a new project, understanding unfamiliar code, or when the user asks to "explore",
  "understand", "find where X is implemented", or "how does Y work". Reduces token
  waste by using strategic search instead of sequential file reading.
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.3"
  tokens: "0.7k"
  sources: "simonwillison.net, github.com/openai/codex, code.visualstudio.com/api"
---

# Codebase Exploration Playbook

## Golden Rules

1. **First: check for errors** — `get_errors()` before anything else. Fixing compile errors is priority zero.
2. **NEVER read files one by one** — `grep_search` with regex alternation first
3. **`semantic_search` for concepts**, `grep_search` for exact symbols
4. **`file_search` for globs** to discover structure instantly
5. **Read 100+ lines at a time** — fewer reads = fewer tokens
6. **Parallel reads** — read 2-3 key files in one turn
7. **Avoid the "grep tax"** — use familiar formats (Markdown/YAML), not obscure ones

## Progressive Disclosure (Skill Pattern)

Top coding agents (Codex, Claude Code) use this — do the same:
1. **Metadata** (~100 tokens): name + description loaded for ALL files
2. **Instructions** (< 500 lines): body loaded when triggered
3. **Resources** (on-demand): only files referenced via Markdown links

## Strategy by Goal

| Goal | Approach |
|------|----------|
| "Where is X?" | `grep_search` → `vscode_listCodeUsages` → read defining file |
| "How does this work?" | `file_search("**/*.{ts,js}")` → `semantic_search("architecture")` → read ONE key file deeply |
| "Find tests for Y" | `file_search("**/Y*.spec.ts")` — glob is instant |
| "What deps?" | `read_file("package.json", 1, 100)` — one read |
| "Are there errors?" | `get_errors()` FIRST — then grep for error symbols |
| "Find all imports of X" | `grep_search("import.*X", isRegexp=true)` across `**/*.ts` |

## Tool Quick Reference

| Tool | Best for |
|------|---------|
| `get_errors(filePaths)` | **Always first** — compile/lint errors |
| `grep_search(query, isRegexp, includePattern)` | Text/regex: `function|class|interface` |
| `semantic_search(query)` | Natural language: "how does auth work" |
| `file_search(query)` | Glob: `**/*.spec.ts`, `**/*.component.ts` |
| `read_file(path, start, end)` | Read 100+ line chunks (parallel when possible) |
| `vscode_listCodeUsages(symbol, lineContent)` | All references of a symbol |
| `list_dir(path)` | Directory listing |

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Read 15 files sequentially | Search first, read 2-3 key files in parallel |
| Read 20-line chunks | 100-200 lines at a time |
| Single-keyword searches | Regex alternation |
| Guess file locations | `file_search` with globs |
| Use obscure formats for context | Markdown/YAML — models know them best |
| Skip error checking | `get_errors()` as step 1 |

## Token Economics

| Approach | Tokens |
|----------|--------|
| Sequential 15 files × 500 tokens | ~7,500 |
| With this playbook | ~700 |
| **Savings** | **~91%** |
