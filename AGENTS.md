# Repository Guidelines

## Project Structure & Module Organization

This is an Electron Vite application using React and TypeScript. Main-process code lives in `src/main`, with IPC handlers under `src/main/ipc` and persistence utilities under `src/main/storage`. The preload bridge is in `src/preload`, shared types and channel constants are in `src/shared`, and renderer code lives in `src/renderer/src`.

Renderer components are grouped by feature under `src/renderer/src/views` and shared UI under `src/renderer/src/components/shared`. Static styles are in `src/renderer/src/assets`. Packaging assets are split between `build` and `resources`.

## Product Context

ChunkShare is a desktop app for friends who want to share one Minecraft world without paying for always-on hosting. The app manages a local Minecraft dedicated server, stable world storage, and handoff safety so different friends can take turns hosting the same shared world.

Core flow: check if someone is hosting, download the latest world version, start a local dedicated server, let friends play, stop safely, save the world as a new version, then unlock it for the next host.

Key concepts: no live world sync while the server is running, `control.json` for save metadata and lock/session state, stable `world.zip` storage, `sessionId` to prevent stale writes, dirty-state detection for unsafe shutdowns, heartbeat checks for current host liveness, and persisted world ownership.

Google Drive-backed worlds keep stable `control.json` and `world.zip` file IDs. `world.zip` is updated in place and Drive revisions provide cloud recovery. Keep the `drive.file` OAuth scope. Folder permission grants a Google account access, while Google Picker authorization grants ChunkShare API access to the two stable files. Join links identify the folder and files only; they must never contain OAuth tokens or credentials.

Keep renderer work UI-only. Filesystem, Java validation, Minecraft server process management, zip/unzip, storage providers, Google Drive integration, and OAuth handling belong in Electron main behind typed preload APIs.

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

Vitest integration tests live under `tests/integration`. Playwright Electron E2E tests live under `tests/e2e`. Tests must use isolated `.test-data` storage and mocked external services; never use real app data, OAuth sessions, or Google Drive files.

- `pnpm test`: run integration tests.
- `pnpm e2e`: run Playwright E2E tests.
- `pnpm e2e <test-file>`: run one E2E test file.
- `pnpm e2e:slow <test-file>`: run E2E tests with optional pacing after user actions.
- `pnpm test:e2e`: build the app and run the complete E2E suite.

Use the shared E2E user-action helper for Playwright interactions so optional pacing remains consistent. Keep locators and assertions native Playwright.

Run the narrowest relevant test first. Run broader suites after focused validation passes or when the change has wider regression risk. Also validate relevant changes with `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

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

Before adding UI components, loading states, or CSS, search for existing components and styles that can be reused or made common.

Keep implementations limited to the requested flow. Do not add speculative fallback behavior, invitation emails, compatibility for unreleased formats, or abstractions without a current use.

Do not introduce background polling of external APIs without an explicit product need and consideration of request volume.

Prefer explicit sequential lifecycle operations when ordering protects shared state. Do not add queues to compensate for a design that should prevent concurrent operations.

Persist important domain facts, such as world ownership, instead of inferring them through remote requests.

Remove temporary diagnostic logging before handoff.

When removing or changing non-obvious behavior, briefly explain the reason to the user. Do not add source comments only to preserve discussion context.

When the user requests implementation in reviewable steps, complete only the approved step and wait before continuing.

Do not rewrite unrelated files, introduce dependencies, silently change behavior, or leave fake/placeholder code that appears complete.

Keep the app buildable when practical. After implementation, summarize changed files as:

`file/path.ts`: changed X **So that** Y.
