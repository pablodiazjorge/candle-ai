---
name: git-workflow
description: |
  Git best practices for AI coding agents. Use when committing changes, creating
  branches, splitting PRs, reviewing code, or setting up worktrees. Covers
  Conventional Commits v1.0.0 spec, atomic commits, stacked PRs, squash-based
  workflow, and worktree patterns.
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.2"
  tokens: "0.5k"
  sources: "conventionalcommits.org, git-scm.com/docs/git-worktree"
---

# Git Workflow

## Conventional Commits v1.0.0

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | SemVer | Use |
|------|--------|-----|
| `feat` | MINOR | New feature |
| `fix` | PATCH | Bug fix |
| `docs` | — | Documentation only |
| `style` | — | Formatting, no logic change |
| `refactor` | — | Code change, no fix/feature |
| `perf` | — | Performance improvement |
| `test` | — | Adding/correcting tests |
| `chore` | — | Build, deps, tooling |
| `ci` | — | CI/CD config |
| `revert` | — | Reverting commits |

### BREAKING CHANGE (MAJOR)

Two valid forms per spec:
```
feat(api)!: send email on shipment       # ! before :
```
```
feat: allow config extension

BREAKING CHANGE: `extends` key now used for extending configs
```

### Revert
```
revert: let us never speak of the noodle incident

Refs: 676104e, a215868
```

## Atomic Commits

One logical change per commit. Use `git add -p` for interactive staging:
```bash
git add -p                     # Stage hunks interactively
git add src/models/            # Stage specific directory
```

**Good:** "Add user model and validation" / **Bad:** "Add user model, fix navbar bug, update readme"

## PR Splitting (Stacked PRs)

1. **PR 1 (base):** Models, interfaces, types
2. **PR 2 (logic):** Services, state management
3. **PR 3 (UI):** Components, templates, styles
4. **PR 4 (tests):** Unit/integration tests

Each PR compiles independently. **Squash-based workflow**: lead maintainer cleans commit messages on merge.

## Branch Naming

```
feature/<name>   fix/<name>   refactor/<name>   docs/<name>   chore/<name>
```

## Worktrees (for PR reviews)

```bash
git worktree add -b review-pr-42 ../review feature/branch
git worktree list
git worktree remove ../review
```

## Stashing

```bash
git stash                              # Quick
git stash push -m "WIP: refactoring"   # Named
git stash --include-untracked          # + untracked
git stash --staged                     # Only staged
git stash pop                          # Apply latest
```
