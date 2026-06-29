# Repository Guidelines

## Project Structure & Module Organization

This is an Electron Vite application using React and TypeScript. Main-process code lives in `src/main`, with IPC handlers under `src/main/ipc` and persistence utilities under `src/main/storage`. The preload bridge is in `src/preload`, shared types and channel constants are in `src/shared`, and renderer code lives in `src/renderer/src`. Renderer components are grouped by feature under `src/renderer/src/views` and shared UI under `src/renderer/src/components/shared`. Static styles are in `src/renderer/src/assets`. Packaging assets are split between `build` and `resources`.

## Product Context

ChunkShare is a desktop app for friends who want to share one Minecraft world without paying for always-on hosting. The app manages a local Minecraft dedicated server, versioned world snapshots, and handoff safety so different friends can take turns hosting the same shared world.

Core flow: check if someone is hosting, download the latest world version, start a local dedicated server, let friends play, stop safely, save the world as a new version, then unlock it for the next host.

Key concepts: versioned world zip snapshots, no live world sync while the server is running, `lock.json` to prevent two hosts, `sessionId` to prevent stale writes, dirty-state detection for unsafe shutdowns, heartbeat checks for current host liveness, local `.mock-cloud/` storage first, and Google Drive storage later.

Keep renderer work UI-only. Filesystem, Java validation, Minecraft server process management, zip/unzip, mock cloud storage, and future Google Drive integration belong in Electron main behind typed preload APIs.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies and Electron native app deps.
- `pnpm dev`: run the Electron Vite development app.
- `pnpm start`: preview the built Electron app.
- `pnpm lint`: run ESLint with cache over the repository.
- `pnpm format`: format files with Prettier.
- `pnpm typecheck`: run both Node and web TypeScript checks.
- `pnpm build`: typecheck and build the app.
- `pnpm build:win`, `pnpm build:mac`, `pnpm build:linux`: create platform packages with electron-builder.

## Coding Style & Naming Conventions

Use TypeScript for application code and React `.tsx` files for renderer components. Follow the existing component pattern: `PascalCase` component folders and files such as `ServerHeader/ServerHeader.tsx`, paired with local `.css` when needed. Use `kebab-case` for non-component utility files, especially IPC and storage modules such as `storage-service.ts`.

Keep interfaces, types, and constants out of implementation files by default. Put them in a nearby `*.model.ts` file, or an existing shared model/constants file when the values are used across modules. Prefer generic domain names for model files, such as `auth.model.ts`, instead of hook- or implementation-specific names such as `useAuthSession.model.ts`.

Avoid prefixing promise calls with the `void` operator unless explicit fire-and-forget behavior is necessary for correctness or required by linting. Prefer the cleaner direct call when the promise handles its own errors and its result is intentionally unused.

Formatting is controlled by `.editorconfig` and Prettier: 2-space indentation, LF line endings, single quotes, no semicolons, 100-column print width, and no trailing commas. Run `pnpm lint` and `pnpm format` before handoff.

## Testing Guidelines

No automated test framework is currently configured. For now, validate changes with `pnpm typecheck`, `pnpm lint`, and `pnpm build`. When adding tests, prefer colocated test files named after the unit under test, for example `storage-service.test.ts`, and document the new test command in `package.json` and this guide.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example `Removed unused assets` and `Add sign in and dashboard mock screens`. Keep messages concise and focused on one change.

Pull requests should include a brief description, the commands run for verification, and screenshots or screen recordings for renderer UI changes. Link related issues when available. Call out changes to IPC channels, preload APIs, or persisted storage shape because those affect multiple layers.

## Code Review Guidelines

When reviewing code changes (such as active branch diffs or Pull Requests), evaluate against these specific checkpoints based on repository rules:

### A. Core Architectural & Code Quality Checkpoints

1. **Process & Interface Boundaries**: Verify that main-process logic (filesystem, networking, security, OAuth) is strictly isolated from the renderer. Check that the preload bridge exposes only minimal, typed methods and does not leak Electron/Node APIs.
2. **KISS & YAGNI (Keep It Simple & Avoid Over-engineering)**:
   - Identify overly clever, complex, or hard-to-read code. Ask if it can be simplified.
   - Watch out for speculative abstraction or placeholder functions added for future features that are not yet needed (YAGNI).
3. **DRY (Don't Repeat Yourself) & Design Patterns**:
   - Spot duplicate logical paths (e.g., repeated server state checks, file path resolution) and determine if abstraction is appropriate.
   - Look for opportunities to apply clear, clean design patterns (such as service separation, domain model isolation, input adapters, or event handlers) to simplify state management.
4. **Code Smells & Readability**:
   - Check for large, bloated components, long functions, or files containing multiple mixed concerns.
   - Look for cryptic variable or function names, deeply nested conditional blocks, or side-effects hidden within getters/helpers.
5. **Security & Vulnerabilities**:
   - Ensure local user data or credentials (like tokens) are encrypted using Electron's `safeStorage`.
   - Check that all inputs at system boundaries (e.g., IPC handles, config file parses, server address formats) are strictly validated.
   - Identify potential network vulnerabilities, resource/handle leaks (e.g., unclosed callback servers, timers, or stream sockets), or hardcoded credentials.

### B. Structure & Pattern Checklist

1. **Project Layout**: Ensure new files are in correct directories (`src/main` for main-process, `src/main/ipc` for IPC handlers, `src/main/storage` for persistence, `src/preload` for preload, `src/shared` for shared types/constants, and `src/renderer/src` for React views).
2. **Naming and File Conventions**:
   - Component directories and files must be `PascalCase` with matching local `.css` styles if needed.
   - Utility, helper, and service files must be `kebab-case`.
   - Local models and interfaces must be placed in a nearby `*.model.ts` file using generic domain names (e.g. `auth.model.ts` instead of `useAuthSession.model.ts`).
3. **Formatting & Static Analysis**:
   - Ensure files have LF line endings, 2-space indentation, single quotes, no semicolons, 100-character print width, and no trailing commas. Validate this by running Prettier (`pnpm format`).
   - Run `pnpm typecheck` and `pnpm lint` to verify that the changes build cleanly and remain error/warning-free.
4. **Reporting Findings**: Present findings clearly, categorized by severity (High, Medium, Low), and provide concrete code recommendations or diffs with links to the target files. Focus strictly on actionable items, issues, potential security bugs, readability flaws, or improvements. Do **not** list checkpoints that passed successfully (e.g., stating "PASS" and explaining why) or explain why code sections are correct when no changes are needed.

## Security & Configuration Tips

Keep renderer access to main-process features behind typed preload APIs and shared IPC channel constants. Do not expose broad Electron or Node globals to the renderer. Avoid committing generated output from `out`, packaged artifacts, or local storage data.

## Agent Collaboration Guidelines

Act as a senior pair-programming assistant. For new tasks, inspect relevant files first, explain what you found, propose a concrete implementation plan, and wait for approval before coding. After approval, implement one small step at a time and pause for review before continuing to the next step.

Keep user-facing messages concise and high-signal. Prefer short summaries, concrete next steps, and direct answers over long explanations. When the user asks for status or context, answer in a few bullets. Avoid repeating obvious repo facts unless they matter for the current decision.

Before each step, state what will change and why. After each step, summarize the files changed, the reason for the change, and how to test it. Ask before broad architectural, data, security, dependency, or project-structure changes.

Write portfolio-quality, maintainable code. Use clear names, small focused functions, explicit types, isolated side effects, predictable error handling, and validation at system boundaries. Keep UI, business logic, state, infrastructure, and filesystem/network work separated where practical.

Apply Clean Code and SOLID principles pragmatically: prefer KISS and YAGNI, avoid clever code, avoid large components or services, remove meaningful duplication without abstracting too early, and make invalid states hard to represent when possible.

Do not rewrite unrelated files, introduce dependencies, silently change existing behavior, or leave fake code that appears to work. Keep the app buildable after each step when possible, and be explicit about assumptions, limitations, and TODOs.
