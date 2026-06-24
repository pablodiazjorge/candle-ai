---
applyTo: "**"
---

# Startup Sequence — Mandatory

At the start of every session, before doing anything else:

1. Read the directories under `.github/skills/` to discover all available skills.

2. For each skill, read only the YAML frontmatter (lines between the first two
   `---` delimiters) to get the `name` and `description`.

3. Compare the current task against each description. If it matches, read the
   full `SKILL.md` body and follow its instructions.

4. These skills apply to ALL work regardless of the task. Load them immediately:
   `explore-codebase`, `git-workflow`, `powershell-patterns`, `skill-creator`.

5. Run `get_errors()` across the workspace. Fix any existing errors before
   making new changes.

## During the Session

- Run `auto-improve` at the end of every significant iteration.
- Run `track-tokens` when the user asks about session cost.
- Note errors, API changes, and workarounds mentally. `auto-improve` formalizes
  them into `knowledge/issues/` after the session.

## PowerShell (Windows)

- Chain commands with `;`, never `&&`.
- Never use `@"..."@` heredocs for files containing `{{ }}`. Use the
  `create_file` or `replace_string_in_file` tools instead.
- `nvm use X.Y.Z` after `nvm install`. It does not auto-activate.

## Git

Use Conventional Commits v1.0.0. One logical change per commit.
Branch naming: `feature/<name>`, `fix/<name>`, `docs/<name>`, `chore/<name>`.

## After Each Session

1. Run auto-improve to capture learnings.
2. Run track-tokens if the user asks for cost data.
3. Commit changes to `knowledge/issues/` and any updated skills.

## Tech Stack

- Angular 22 standalone + Signals + Zoneless + Tailwind CSS 4
- lightweight-charts v5 (`addSeries(CandlestickSeries, opts)`, `createSeriesMarkers()` for markers)
- @ngx-translate v18 (`provideTranslateService` + `provideTranslateHttpLoader`, no `TranslateModule`)
- Dexie.js for IndexedDB cache
- Web Workers for heavy computation
- Vitest for tests
