# Repository Guidelines

## Project Structure & Module Organization

This is an Electron Vite application using React and TypeScript. Main-process code lives in `src/main`, with IPC handlers under `src/main/ipc` and persistence utilities under `src/main/storage`. The preload bridge is in `src/preload`, shared types and channel constants are in `src/shared`, and renderer code lives in `src/renderer/src`.

Renderer components are grouped by feature under `src/renderer/src/views` and shared UI under `src/renderer/src/components/shared`. Static styles are in `src/renderer/src/assets`. Packaging assets are split between `build` and `resources`.

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

Follow existing project patterns first. Prefer local consistency unless there is a strong reason to change it.

Use TypeScript for application code and `.tsx` for React components.

Follow file conventions:

- React components: `PascalCase` folders/files, e.g. `ServerHeader/ServerHeader.tsx`
- Utilities, services, IPC, and storage modules: `kebab-case`, e.g. `storage-service.ts`
- Shared/reusable types and constants: nearby `*.model.ts` files or existing shared files

Prefer domain-based model names, such as `auth.model.ts`, instead of implementation-specific names like `useAuthSession.model.ts`.

Keep small local types close to where they are used. Move them out only when reused, exported, or making the file noisy.

Organize functions in reading order: exported entry points first, followed by their direct helpers in call order, with low-level utilities and type guards last.

Avoid `void` before promise calls unless the call is intentionally fire-and-forget or linting requires it.

Name booleans after the positive state they represent, such as `isActive` or `hasValidGoogleDriveFolder`.

In JSX, prefer boolean `&&` rendering over `condition ? element : null`. Ensure the left side is explicitly boolean when needed.

Formatting is handled by `.editorconfig` and Prettier. Run `pnpm lint` and `pnpm format` before handoff when relevant.

## Testing Guidelines

No automated test framework is currently configured. For now, validate changes with `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example `Removed unused assets` and `Add sign in and dashboard mock screens`. Keep messages concise and focused on one change.

## Code Review Guidelines

When reviewing code changes, report only actionable findings. Do not list passed checks.

Check changes against the repository structure, coding conventions, Electron process boundaries, and product rules described above.

Focus especially on:

- Bugs, broken flows, data loss risk, or unsafe behavior
- Renderer/main boundary violations
- Missing validation at IPC, config, file path, server address, or external-response boundaries
- Sensitive data stored insecurely instead of using Electron `safeStorage` when appropriate
- Resource leaks in timers, sockets, streams, servers, subscriptions, or child processes
- Over-engineering, speculative abstractions, large files, long functions, hidden side effects, duplicated logic, or unclear state ownership
- High-risk changes without a clear validation path

Classify findings as **Must fix**, **Should fix**, or **Nit**.

For each finding, include the affected file, the problem, why it matters, and a concrete recommendation.

## Agent Collaboration Guidelines

Act as a senior pair-programming assistant.

For new tasks, inspect relevant files first, explain what you found, propose a concrete plan, and wait for approval before coding.

Keep messages concise: summarize findings, decisions, changes, and next steps in a few bullets when useful.

Do not use em dashes in user-facing messages. Prefer commas, colons, parentheses, or separate sentences.

Proceed in focused implementation steps. Ask for approval before broad architectural, data, security, dependency, or project-structure changes.

Write maintainable code: clear names, small focused functions, explicit types, isolated side effects, predictable error handling, and validation at system boundaries.

Prefer KISS and YAGNI. Avoid clever code, speculative abstractions, large components/services, hidden side effects, and unnecessary duplication.

Do not rewrite unrelated files, introduce dependencies, silently change behavior, or leave fake/placeholder code that appears complete.

Keep the app buildable when practical. After implementation, summarize changed files as:

`file/path.ts`: changed X **Because** Y.
