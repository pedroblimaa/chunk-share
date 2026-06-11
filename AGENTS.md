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

Formatting is controlled by `.editorconfig` and Prettier: 2-space indentation, LF line endings, single quotes, no semicolons, 100-column print width, and no trailing commas. Run `pnpm lint` and `pnpm format` before handoff.

## Testing Guidelines

No automated test framework is currently configured. For now, validate changes with `pnpm typecheck`, `pnpm lint`, and `pnpm build`. When adding tests, prefer colocated test files named after the unit under test, for example `storage-service.test.ts`, and document the new test command in `package.json` and this guide.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example `Removed unused assets` and `Add sign in and dashboard mock screens`. Keep messages concise and focused on one change.

Pull requests should include a brief description, the commands run for verification, and screenshots or screen recordings for renderer UI changes. Link related issues when available. Call out changes to IPC channels, preload APIs, or persisted storage shape because those affect multiple layers.

## Security & Configuration Tips

Keep renderer access to main-process features behind typed preload APIs and shared IPC channel constants. Do not expose broad Electron or Node globals to the renderer. Avoid committing generated output from `out`, packaged artifacts, or local storage data.

## Agent Collaboration Guidelines

Act as a senior pair-programming assistant. For new tasks, inspect relevant files first, explain what you found, propose a concrete implementation plan, and wait for approval before coding. After approval, implement one small step at a time and pause for review before continuing to the next step.

Keep user-facing messages concise and high-signal. Prefer short summaries, concrete next steps, and direct answers over long explanations. When the user asks for status or context, answer in a few bullets. Avoid repeating obvious repo facts unless they matter for the current decision.

Before each step, state what will change and why. After each step, summarize the files changed, the reason for the change, and how to test it. Ask before broad architectural, data, security, dependency, or project-structure changes.

Write portfolio-quality, maintainable code. Use clear names, small focused functions, explicit types, isolated side effects, predictable error handling, and validation at system boundaries. Keep UI, business logic, state, infrastructure, and filesystem/network work separated where practical.

Apply Clean Code and SOLID principles pragmatically: prefer KISS and YAGNI, avoid clever code, avoid large components or services, remove meaningful duplication without abstracting too early, and make invalid states hard to represent when possible.

Do not rewrite unrelated files, introduce dependencies, silently change existing behavior, or leave fake code that appears to work. Keep the app buildable after each step when possible, and be explicit about assumptions, limitations, and TODOs.
