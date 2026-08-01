---
name: review-staged-cleanup
description: Review staged Git changes for unnecessary bloat and concrete cleanup opportunities. Use when a user asks to inspect staged, indexed, or ready-to-commit changes for over-engineering, duplicated logic, oversized files or tests, excessive context plumbing, speculative abstractions, compatibility leftovers, or unrelated staged files.
---

# Review Staged Cleanup

Review only the Git index and identify the few simplifications worth making before commit.

## Workflow

1. Read applicable repository instructions.
2. Inspect `git status --short`, `git diff --cached --stat`, and `git diff --cached`.
3. Treat unstaged and untracked changes as out of scope. Mention them only when the staged/unstaged split itself creates a commit risk.
4. Trace enough surrounding code to distinguish intentional domain boundaries from accidental complexity.
5. Report only actionable cleanup findings. Do not edit unless the user also asks for fixes.

## Review Priorities

- Unrelated files or concerns staged together
- Abstractions that add more indirection than reuse
- Full contexts passed where an ID, path, or focused dependency is enough
- Duplicate wrappers, branches, state, validation, or error handling
- Compatibility code, TODOs, and optional APIs without a current caller
- Large functions, services, fixtures, or test files that mix independent behaviors
- Repeated test setup that can be replaced by small behavior-oriented helpers

Do not recommend abstraction merely to reduce line count. Preserve explicit domain invariants and useful test independence.

## Findings

Return at most three highest-value findings, ordered by impact. For each finding:

- Classify it as **Should fix** or **Nit**. Use **Must fix** only when the bloat creates a real correctness or commit-scope risk.
- Give the exact staged file and line range with a clickable link.
- Explain what is unnecessary and why it increases maintenance cost.
- Recommend the smallest concrete simplification.
- Ask one focused question when the cleanup requires product or architecture judgment.

If no worthwhile simplification remains, say: `No staged cleanup findings.`
