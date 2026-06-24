---
name: skill-creator
description: |
  Create, update, review, fix, or debug Agent Skills following the agentskills.io
  specification and prompt-forge conventions. Use when the user wants to add a
  new skill, improve an existing skill, or when auto-improve promotes an issue
  to a new skill. Covers frontmatter format, description writing, body structure,
  token estimation, and progressive disclosure patterns.
license: MIT
metadata:
  author: pablodiazjorge
  url: https://github.com/pablodiazjorge/prompt-forge
  version: "1.0"
  tokens: "2.3k"
---

# Skill Creator

## When to Use This Skill

Activate this skill when:

- The user asks to create, add, or write a new Agent Skill
- The auto-improve loop promotes an issue and the routing table says to create
  a new skill
- An existing skill needs its frontmatter fixed, its description improved, or
  its body restructured
- The user asks "how do I write a good skill" or similar

## The Agent Skills Standard

prompt-forge skills follow the [agentskills.io](https://agentskills.io)
specification, an open format supported by Claude Code, GitHub Copilot, OpenAI
Codex, Cursor, Gemini CLI, and many others.

### Directory Structure

Each skill is a directory under `.github/skills/` containing a `SKILL.md` file.
The directory name must match the `name` field in the frontmatter.

```
.github/skills/<skill-name>/
├── SKILL.md          # Required: YAML frontmatter + Markdown body
├── scripts/          # Optional: executable code the agent can run
├── references/       # Optional: additional docs loaded on demand
└── assets/           # Optional: templates, images, data files
```

### Frontmatter Specification

The `SKILL.md` file begins with YAML frontmatter between `---` delimiters.
The agentskills.io spec defines these fields:

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars. Lowercase letters, numbers, hyphens only. Must match directory name. |
| `description` | Yes | Max 1024 chars. Describes what the skill does AND when to use it. |
| `license` | No | SPDX identifier or reference to bundled license file |
| `compatibility` | No | Max 500 chars. Environment requirements (OS, packages, network) |
| `metadata` | No | Arbitrary key-value map. Use for extended attributes. |
| `allowed-tools` | No | Experimental. Space-separated list of pre-approved tools. |
| `disable-model-invocation` | No | If `true`, skill loads only on explicit user request, not automatic trigger |

### prompt-forge Extended Metadata

prompt-forge adds these fields inside `metadata` for every skill:

| Field | Purpose |
|-------|---------|
| `metadata.author` | GitHub username of the skill author |
| `metadata.url` | Canonical URL for the skill source |
| `metadata.version` | Semantic version string |
| `metadata.tokens` | Estimated token count of the Markdown body (4 chars per token) |
| `metadata.sources` | Comma-separated list of reference URLs used to build the skill |

These fields are optional per the spec but required by prompt-forge convention.
Always include them when creating a new skill.

## Creating a New Skill

### Step 1: Choose the Name

The name must match the directory that will contain the skill.

Rules:
- Lowercase letters, numbers, and hyphens only
- Must not start or end with a hyphen
- Must not contain consecutive hyphens (`--`)
- Max 64 characters

Good names: `pdf-processing`, `data-analysis`, `code-review`
Bad names: `PDF-Processing`, `-pdf`, `pdf--processing`

### Step 2: Write the Description

The description is the most critical field. It is the ONLY information the agent
has when deciding whether to activate the skill. A poorly written description
means the skill never triggers, or triggers on irrelevant tasks.

A good description:
- States what the skill does in concrete terms
- Includes specific keywords the agent should match against
- Mentions the context or user intent that should trigger it
- Is between 50 and 300 characters

Example of a strong description:

```yaml
description: |
  Create, update, review, fix, or debug Agent Skills following the
  agentskills.io specification and prompt-forge conventions. Use when
  the user wants to add a new skill, improve an existing skill, or when
  auto-improve promotes an issue to a new skill. Covers frontmatter
  format, description writing, body structure, token estimation, and
  progressive disclosure patterns.
```

Example of a weak description:

```yaml
description: Helps with skills.
```

### Step 3: Structure the Body

The body after the frontmatter contains the instructions the agent follows.
Follow these patterns from the agentskills.io best practices:

**Add what the agent lacks, omit what it knows.**
Do not explain what a PDF is or how HTTP works. The agent already knows.
Focus on project-specific conventions, non-obvious edge cases, and particular
tool choices.

**Include a gotchas section.**
The highest-value content is environment-specific facts that defy reasonable
assumptions. If the agent would get something wrong without being told, put it
in a gotchas section.

**Favor procedures over declarations.**
Teach the agent how to approach a class of problems, not what to produce for a
specific instance. "Read the schema file, join tables using the `_id` foreign
key convention, and format results as a Markdown table" is reusable. "Join
`orders` to `customers` on `customer_id`" works only for one query.

**Provide defaults, not menus.**
Pick a recommended approach and mention alternatives only when necessary.

**Use templates for output format.**
When the agent needs to produce output in a specific format, provide a concrete
Markdown template. Agents pattern-match well against structures.

**Use checklists for multi-step workflows.**
An explicit checklist helps the agent track progress and avoid skipping steps.

**Keep the body under 500 lines and 5,000 tokens.**
Move detailed reference material to `references/` files. The agent loads the
full body on activation; every token competes for attention.

### Step 4: Estimate Token Count

After writing the body, count its characters and divide by 4 to estimate tokens.
This is the standard ratio for English text. Set the result in
`metadata.tokens`, rounded to the nearest 0.1k.

PowerShell verification command:

```powershell
$body = ($content -split '---', 3)[2]
$tokens = [Math]::Round($body.Length / 4)
$k = [Math]::Round($tokens / 100, 1)
Write-Host "$k k"
```

### Step 5: Create the Files

Use the agent `create_file` tool to write `SKILL.md` to the new directory
under `.github/skills/<name>/`. The directory must not already exist.

After creating the skill, verify:
- The directory name matches the `name` field exactly
- The `description` includes both WHAT and WHEN
- The `metadata` block has all five prompt-forge fields
- The token count is measured, not guessed
- The body uses the structural patterns described above

## Updating an Existing Skill

When updating a skill, use `replace_string_in_file` to make targeted edits.
Always include 3-5 lines of surrounding context in the match string. After
editing, re-measure the token count and update `metadata.tokens` if it changed
by more than 0.1k.

## Fixing Common Frontmatter Issues

**Problem:** The frontmatter `---` delimiter is missing or malformed.
**Fix:** Ensure exactly three dashes on the first and last line of the
frontmatter block. No spaces before or after.

**Problem:** The `name` field does not match the directory name.
**Fix:** Rename either the directory or the field. They must match exactly.

**Problem:** The `description` does not include trigger conditions.
**Fix:** Add "Use when..." followed by specific user intents or task descriptions.

**Problem:** The `description` uses `>` instead of `|` for multi-line text.
**Fix:** Use `|` (literal block scalar) for multi-line descriptions. The `>`
folded scalar may collapse newlines, making the description harder to read.

## Debugging Skill Activation

If a skill is not triggering when it should:

1. Check the `description` field. Does it contain keywords the user's request
   would match? If the user says "I need to extract text from this PDF" but the
   description says "Document processing utilities," the match may fail.
2. Check `disable-model-invocation`. If `true`, the skill only activates on
   explicit user request, never automatically.
3. Consider whether the description is too narrow or too broad. Too narrow:
   misses valid triggers. Too broad: activates on irrelevant tasks, crowding
   out other skills.
4. Read the description aloud as if you were the agent scanning skills. Would
   you know when to use it?

## Skill Creation Checklist

Before finalizing a new skill, verify:

- [ ] Directory name matches `name` field (lowercase, hyphens, max 64 chars)
- [ ] `description` states what the skill does AND when to use it (50-300 chars)
- [ ] `license` is set (use `MIT` for prompt-forge skills)
- [ ] `metadata.author` is set to a GitHub username
- [ ] `metadata.url` points to the canonical source
- [ ] `metadata.version` uses semantic versioning
- [ ] `metadata.tokens` is measured, not estimated by eye
- [ ] Body is under 500 lines
- [ ] Body includes a gotchas section if there are non-obvious pitfalls
- [ ] Body favors procedures over specific one-off instructions
- [ ] No content explains things the agent already knows
