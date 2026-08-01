# Repository Guidelines

## Project Structure & Module Organization

This is an Electron Vite application using React and TypeScript. Main-process code lives in `src/main`, with IPC handlers under `src/main/ipc/handlers` and storage adapters, persistence, and server-save operations under `src/main/storage`. The preload bridge is in `src/preload`, shared types and channel constants are in `src/shared`, and renderer code lives in `src/renderer/src`.

The persisted app and world catalog is modeled in `src/shared/world.ts` and stored in `localState.json`. World-bound main-process operations use `WorldContext` from `src/main/storage/core/world-context.ts`; world path construction belongs in `src/main/storage/core/support/storage-paths.ts`.

World-scoped paths map server installations to `.servers/<worldId>`, local provider data to `.storage/<worldId>`, and backups to `.backups/<worldId>`. Server setup, runtime, save/restore, and backup flows use this layout. Use `WorldContext` or `getWorldPaths` instead of assembling world paths directly.

Renderer components are grouped by feature under `src/renderer/src/views` and shared UI under `src/renderer/src/components/shared`. Global styles and design tokens are in `src/renderer/src/assets`; component styles are colocated with their components. Packaging assets are split between `build` and `resources`.

Unit tests live in `tests/unit`, integration tests live in `tests/integration`, Electron E2E tests are grouped by feature under `tests/e2e`, and reusable E2E helpers live in `tests/e2e/support`. Cross-suite Google Drive test infrastructure lives in `tests/support`.

## Product Context

ChunkShare is a desktop app for friends who want to share Minecraft worlds without paying for always-on hosting. The app manages a catalog of worlds, local Minecraft dedicated servers, stable world storage, and handoff safety so different friends can take turns hosting each shared world.

Core flow: check if someone is hosting, download the latest world version, start a local dedicated server, let friends play, stop safely, save the world as a new version, then unlock it for the next host.

`AppState` owns global facts such as the signed-in player, selected world ID, active storage provider, and Google Drive setup status. Each `LocalWorldState` owns that world's server configuration, setup state, local save version, session data, and Drive association. The app may contain multiple worlds, but only one local Minecraft process may run at a time.

The selected world is mutable UI state. Long-running, runtime, storage, and destructive operations must capture a world ID or `WorldContext` when they begin and keep using it across every `await`. Never re-resolve the selected world to finish an existing operation. Runtime and lifecycle flows capture a `WorldOperationContext`, which binds the world and storage adapter together. Delete and update worlds by explicit ID so changing selection cannot redirect work to another world.

Storage provider selection is global, not per world. Switching providers reconciles the visible catalog: installed-only worlds remain visible as local-only, provider-only worlds remain available to download, worlds present in both follow the normal latest-version flow, and worlds present in neither are omitted.

Key concepts: no live world sync while the server is running, world-scoped `control.json` for save metadata and lock/session state, stable `world.zip` storage, `sessionId` to prevent stale writes, heartbeat checks for current host liveness, and persisted world ownership. Every `control.json` includes its stable `worldId`. Local state includes a `dirty` field for future unsafe-shutdown handling, but the runtime does not currently mark worlds dirty.

Google Drive setup and provider status are global, while folder and stable file associations are world-scoped. Drive folder names are not persisted because IDs are authoritative. Google Drive-backed worlds keep stable `control.json` and `world.zip` file IDs. Validate both files' metadata, folder membership, and the control file's `worldId` together before reads, mutations, or deletion. `world.zip` is updated in place and Drive revisions provide cloud recovery. Keep the `drive.file` OAuth scope. Folder permission grants a Google account access, while Google Picker authorization grants ChunkShare API access to the two stable files. Join links identify the folder and files only; they must never contain OAuth tokens or credentials.

Lock recovery may replace an invalid `serverLock` inside `control.json`, but it must preserve valid save metadata and storage-mutation state.

Keep renderer work UI-only. Filesystem, Java validation, Minecraft server process management, zip/unzip, storage providers, Google Drive integration, and OAuth handling belong in Electron main behind typed preload APIs.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies and Electron native app deps.
- `pnpm check:electron`: verify that the Electron binary is installed and runnable.
- `pnpm clean:dev-data`: remove local development data so the app starts from a clean state.
- `pnpm dev`: run the Electron Vite development app.
- `pnpm start`: preview the built Electron app.
- `pnpm lint`: run ESLint with cache over the repository.
- `pnpm format`: format files with Prettier.
- `pnpm test`: run all Vitest unit and integration tests.
- `pnpm test:watch`: run Vitest in watch mode.
- `pnpm exec vitest run <test-file> --project unit`: run one focused unit test file; use `--project integration` for an integration test.
- `pnpm e2e`: run Playwright Electron E2E tests against the existing build.
- `pnpm e2e:slow <test-file>`: run E2E tests with optional pacing after user actions.
- `pnpm test:e2e`: build the app and run the complete E2E suite.
- `pnpm typecheck`: run both Node and web TypeScript checks.
- `pnpm build`: typecheck and build the app.
- `pnpm verify`: check formatting, lint, run unit/integration tests, typecheck, and build.
- `pnpm verify:full`: run `pnpm verify` and the complete Electron E2E suite.
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

Google Drive, OAuth, Minecraft downloads, and Minecraft server processes are mocked in automated tests. Current E2E coverage includes authentication, local world lifecycle, sharing and joining, two-instance hosting handoff, publish-failure recovery, relaunch persistence, storage-provider switching, server removal, and control-lock recovery.

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
