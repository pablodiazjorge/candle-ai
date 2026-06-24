---
name: powershell-patterns
description: |
  PowerShell 5.1 patterns, pitfalls, and best practices for Windows development.
  Use when running terminal commands, writing PowerShell scripts, working with
  Node.js/npm on Windows, or encountering PowerShell errors. Covers nvm-windows,
  Angular template escaping, execution policy, and cmdlet selection.
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.2"
  tokens: "0.6k"
  sources: "learn.microsoft.com/powershell, github.com/coreybutler/nvm-windows"
---

# PowerShell Patterns for Development

## Critical Pitfalls

### Templates with `{{ }}` — NEVER use Set-Content or heredocs

PowerShell interprets `{{ }}` as variable interpolation. Use the agent's `create_file`
tool for any file containing `{{ }}`, `${{}}`, or Angular syntax.

```powershell
# ❌ NEVER:
Set-Content file.html @"<div>{{ title }}</div>"@

# ✅ Always: agent create_file tool
# Editing existing files: replace_string_in_file
# Commands WITHOUT {{ }}: Set-Content with single quotes works fine
```

### nvm-windows

- `nvm install X.Y.Z` does **NOT auto-activate** → `nvm use X.Y.Z` is mandatory
- `nvm list` shows installed versions, `*` = active
- Global packages (`@angular/cli`) are **NOT migrated** between versions
- **Requires Admin shell** — run PowerShell as Administrator
- `@angular/cli@22` → Node `^22.22.3 || ^24.15.0 || >=26.0.0`

### Chaining — NEVER `&&`

`&&` is not valid in PowerShell 5.1:
```powershell
npm install; npm run build   # OK
npm install                  # Better: separate commands
npm run build
```

### Execution Policy

Windows 11/10 default to `Restricted` — `.ps1` scripts won't execute.
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned              # Requires admin
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser  # Without admin
```

## Best Practices

1. **Native cmdlets** not aliases: `Get-ChildItem` not `ls`, `Select-String` not `findstr`
2. **Quote paths**: `"C:\Path With Spaces\file.txt"`
3. **`Select-Object -First N`** to limit output
4. **`2>$null`** to suppress stderr
5. **`Test-Path`** before reading/writing
6. **NEVER `Start-Sleep`** — the agent is notified when async commands finish
7. **`Remove-Item -Force`** to delete; **`Push-Location`/`Pop-Location`** to navigate

## File Operations Decision Table

| Task | Tool |
|------|------|
| Create file with `{{ }}` | Agent `create_file` |
| Edit existing file | `replace_string_in_file` |
| Multiple simultaneous edits | `multi_replace_string_in_file` |
| Simple script without templates | `Set-Content` with single quotes |
| Overwrite existing file | `Remove-Item -Force` → `create_file` |
