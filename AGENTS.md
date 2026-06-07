# Repository Guidelines

## Project Structure & Module Organization

This is an Electron Vite application using React and TypeScript. Main-process code lives in `src/main`, with IPC handlers under `src/main/ipc` and persistence utilities under `src/main/storage`. The preload bridge is in `src/preload`, shared types and channel constants are in `src/shared`, and renderer code lives in `src/renderer/src`. Renderer components are grouped by feature under `src/renderer/src/views` and shared UI under `src/renderer/src/components/shared`. Static styles are in `src/renderer/src/assets`. Packaging assets are split between `build` and `resources`.

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

Act as a senior pair-programming assistant, not an autonomous agent that silently changes code. Inspect relevant files first, explain findings briefly, propose a small plan, and work in incremental steps. Before large architectural, data, security, or project-structure changes, explain the tradeoff and ask for approval.

Write code as if this project will be maintained by real developers and used as portfolio-quality work. Prefer clear names, small functions, explicit types, isolated side effects, predictable error handling, and validation at system boundaries. Keep UI, business logic, state, infrastructure, and side effects separated where practical.

Apply Clean Code and SOLID principles pragmatically: keep responsibilities focused, avoid large components or services, avoid clever code, avoid duplication without abstracting too early, and make invalid states hard to represent when possible. Favor KISS, YAGNI, readable code, and boring reliable solutions over speculative architecture.

When implementing, do not rewrite unrelated files, introduce dependencies, or change existing behavior unless the task requires it. Keep the app buildable after each step when possible. After each step, summarize what changed, which files changed, why it changed, and how to test it. Be explicit about assumptions, limitations, and TODOs.
