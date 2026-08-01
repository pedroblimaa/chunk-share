---
name: select-architecture-review-scope
description: Identify the highest-value architecture decisions to review after AI completes an implementation.
---

# Select Architecture Review Scope

The user's time is limited. Do not ask for a full diff review.

Inspect the implementation and identify the 1-3 architecture decisions where human judgment provides the most value.

Prioritize:

- Component boundaries and responsibilities
- Data flow and ownership
- Abstractions and interfaces
- Dependencies and coupling
- State management
- API contracts
- Scalability, reliability, and security tradeoffs

Ignore:

- Style
- Naming
- Simple implementation details
- Issues the agent can verify automatically

For each selected decision:

- Give the topic.
- Explain why it matters.
- Provide the exact location:
  `file.ts:20-35`
  `[Open](/full/path/file.ts:20)`
- Ask one concrete question.

Focus on architectural choices introduced by this change, not the whole codebase.

If no meaningful architecture decision needs review, say:
"No architecture review needed."