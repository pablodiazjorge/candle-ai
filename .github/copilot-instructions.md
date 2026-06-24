# Agent Instructions

## Skills

Skills live in `.github/skills/`. Load a skill when the conversation matches
its description. Skills `explore-codebase`, `git-workflow`,
`powershell-patterns`, and `skill-creator` apply to all work.

Run `auto-improve` at the end of every significant iteration. Run
`track-tokens` when the user asks about cost or session statistics.

## Issue Registry

Persistent issue tracking lives in `knowledge/issues/`. When you encounter
an error, API change, or workaround worth remembering, note it mentally.
`auto-improve` formalizes it after the session. Issues that recur three or
more times get promoted to skills or persistent memory.

## PowerShell

- Chain commands with `;`, never `&&`
- Never use `@"..."@` heredocs for files containing `{{ }}` — use
  `create_file` or `replace_string_in_file` instead
- `nvm use X.Y.Z` after `nvm install` — it does not auto-activate

## Git

Use Conventional Commits v1.0.0. One logical change per commit.

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
chore:    Build, deps, tooling
refactor: Code change, no fix or feature
test:     Adding or correcting tests
```

Branch naming: `feature/<name>`, `fix/<name>`, `docs/<name>`, `chore/<name>`.

## Codebase Exploration

Run `get_errors()` before any code change. Search before reading:
`grep_search`, then `semantic_search`, then `file_search`. Read 100 or more
lines at a time. Parallel reads when possible. Never read files one by one.

## After Each Session

1. Run auto-improve to capture learnings
2. Run track-tokens if the user asks for cost data
3. Commit changes to `knowledge/issues/` and any updated skills
