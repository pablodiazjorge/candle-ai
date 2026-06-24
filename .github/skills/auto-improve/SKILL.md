---
name: auto-improve
description: |
  Post-session learning loop. Use at the END of every coding iteration or when
  the user says "analyze this session", "what did we learn", "save lessons",
  or "run auto-improve". Reviews the chat for errors, fixes, API discoveries,
  and patterns. Cross-references with the issue registry to detect recurrence.
  Promotes confirmed patterns to user memory, repo memory, or new skills.
  NEVER invoke mid-task — only at natural stopping points.
disable-model-invocation: false
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.0"
  tokens: "1.5k"
---

# Auto-Improve: Post-Session Learning Loop

## Trigger

Run at the END of every significant coding iteration OR when the user explicitly
requests it. Do NOT run mid-task — wait for a natural stopping point.

## Algorithm

### Phase 1 — Scan Current Chat

Review the current conversation for these signal types:

| Signal | Examples | Priority |
|--------|----------|----------|
| **Error fixed** | "PowerShell interpretó `{{ }}` mal", "ngx-translate v18 no tiene `forRoot()`" | HIGH |
| **API discovery** | "`linkedSignal` requires Node ≥22", "`provideZonelessChangeDetection()` is stable in Angular 22" | HIGH |
| **Workaround found** | "Usa `create_file` en vez de `Set-Content` para templates" | MEDIUM |
| **Pattern repeated** | Same error occurred 2+ times in this session alone | HIGH |
| **Project quirk** | "Este monorepo usa npm workspaces", "El `.gitignore` excluye `.github/`" | MEDIUM |
| **Tool limitation** | "Copilot no expone `usage.prompt_tokens` directamente" | LOW |
| **User preference** | "Prefiere comandos separados con `;` no `&&`" | MEDIUM |

### Phase 2 — Cross-Reference with Issue Registry

1. **Read `knowledge/issues/INDEX.md`** — get all existing issue IDs, titles, categories
2. **For each signal from Phase 1**, attempt to match against existing issues:
   - Match by keyword overlap (title + description)
   - Match by category + similar error pattern
   - Use `grep_search` on `knowledge/issues/open/` for related content

### Phase 3 — Create or Update Issues

#### NEW issue (no match found)
```
Generate ID: ISSUE-YYYYMMDD-XXXX where XXXX = first 4 hex chars of a UUID
  PowerShell: [guid]::NewGuid().ToString().Substring(0, 4)
  Example: ISSUE-20260624-a1b2
Create knowledge/issues/open/ISSUE-YYYYMMDD-XXXX.md using TEMPLATE.md
Set occurrences=1, certainty=low, status=open
Insert a new row into INDEX.md → Open Issues table
If you have session token data, optionally add it to Evidence section
```
IDs are UUID-based — no need to read INDEX.md first. Zero collision risk
across multiple developers working simultaneously.

#### UPDATE existing issue (match found)
```
Increment occurrences by 1
Update last_seen to today's date
Append current session info to sessions array
Re-evaluate certainty:
  - 1 occurrence → low
  - 2 occurrences → medium
  - 3+ occurrences → high
Update the issue file in open/ using replace_string_in_file
Update INDEX.md counts
```

#### INDEX.md merge conflicts
If two developers add rows to INDEX.md simultaneously, a Git merge
conflict will occur on the table body. Resolution: keep ALL rows from
both branches; re-count directories to update Summary numbers.

### Phase 4 — Evaluate Promotion Criteria

For each issue with `certainty: high` (3+ occurrences):

| Category | Promotion Target | Action |
|----------|-----------------|--------|
| `library-api` | `/memories/<lib>-api.md` | Check if memory file exists; if so, `str_replace` to add. If not, `create`. |
| `powershell` | `powershell-patterns/SKILL.md` | `replace_string_in_file` to add new pitfall/pattern. |
| `angular` | `/memories/` or angular skill | If Angular-specific API version info → user memory. If scaffold pattern → angular-scaffold skill. |
| `git` | `git-workflow/SKILL.md` | `replace_string_in_file` to add new pattern. |
| `project-specific` | `/memories/repo/` | Create or update repo memory file. |
| `unknown` | — | Do NOT promote. Leave in `open/`. |

After promotion:
1. Move issue file from `open/` to `promoted/`
2. Update issue frontmatter: `status: promoted`, add resolution date
3. Update `INDEX.md`: remove from Open, add to Promoted table

### Phase 5 — Periodic Cleanup

For issues in `open/` with:
- `occurrences: 1` AND `first_seen > 30 days ago`
- `certainty: low`

→ Move to `discarded/`, update status to `discarded`, add reason: "Single occurrence, >30 days without recurrence."

### Phase 6 — Report

Output a summary table:

```
## Auto-Improve Report — 2026-06-24

| Action | ID | Title | Detail |
|--------|----|-------|--------|
| 🆕 New | ISSUE-001 | ... | Created in open/ |
| 📈 Updated | ISSUE-002 | ... | 1→2 occurrences, certainty low→medium |
| 📦 Promoted | ISSUE-003 | ... | → powershell-patterns/SKILL.md |
| 🗑️ Discarded | ISSUE-004 | ... | >30 days, single occurrence |
```

## Important Rules

1. **NEVER create a skill for something the model already knows** — if it's
   common knowledge (e.g., "use `const` not `var`"), skip it.

2. **ALWAYS get user confirmation before promoting to a skill** — use
   `vscode_askQuestions` to ask: "I found pattern X occurring 3 times.
   Promote to a skill?" Unless the user previously said "always auto-promote."

3. **Prefer updating existing skills over creating new ones** — a new pitfall
   in PowerShell belongs in `powershell-patterns/SKILL.md`, not a new skill.

4. **Keep issue files concise** — the TEMPLATE.md format is the maximum, not
   the minimum. Don't write essays.

5. **Session isolation** — the `sessions` array in frontmatter stores session
   UUIDs. Use `session_store_sql` to find the current session UUID if available,
   otherwise use a date-based identifier.

## File Paths Reference

| Resource | Path |
|----------|------|
| Issue registry index | `knowledge/issues/INDEX.md` |
| Issue template | `knowledge/issues/TEMPLATE.md` |
| Open issues | `knowledge/issues/open/ISSUE-XXX.md` |
| Promoted issues | `knowledge/issues/promoted/ISSUE-XXX.md` |
| Discarded issues | `knowledge/issues/discarded/ISSUE-XXX.md` |
| User memory | `/memories/<topic>.md` |
| Repo memory | `/memories/repo/<topic>.md` |
| Skills | `.github/skills/<name>/SKILL.md` |
