# Chunk Share - Project Context

Chunk Share is an Electron application designed for friends to share and host Minecraft servers collaboratively without dedicated hosting. It manages local Minecraft server instances, world snapshots, and handoff safety.

## Architecture & Module Organization

The project follows a modular Electron architecture using Vite and TypeScript.

- **Main Process (`src/main`)**: Contains core application logic, services, and IPC handlers.
  - `dashboard/`: State aggregation for the UI.
  - `ipc/`: Typed IPC handlers bridge to the renderer.
  - `server-runtime/`: Process management for the Minecraft server.
  - `server-setup/`: Version resolution and server instance deployment.
  - `storage/`: Local state management and "mock cloud" synchronization.
- **Preload (`src/preload`)**: Securely exposes typed APIs to the renderer via `contextBridge`.
- **Renderer (`src/renderer/src`)**: React frontend using TypeScript and Vanilla CSS.
  - `views/`: Feature-specific components (Auth, Dashboard, Setup, Servers).
  - `components/shared/`: Reusable UI components.
  - `assets/`: Global styles and assets.
- **Shared (`src/shared`)**: Domain types and IPC channel constants used by both processes.
- **Mock Cloud (`.mock-cloud/`)**: Local directory simulating remote storage for saves and locks.

## Core Concepts

- **World Snapshots**: Versioned zip files of Minecraft worlds.
- **Handoff Safety**: Uses `lock.json` and `sessionId` to prevent concurrent hosts and stale writes.
- **Dirty State Detection**: Tracks unsafe shutdowns to prevent data loss.
- **Heartbeat**: Liveness checks for the current host.
- **Mock Cloud**: Initial implementation uses local filesystem; future integration with Google Drive.

## Building and Running

- `pnpm install`: Install dependencies and native modules.
- `pnpm dev`: Start the development environment with HMR.
- `pnpm build:win` | `pnpm build:mac` | `pnpm build:linux`: Package for specific platforms.
- `pnpm typecheck`: Run TypeScript compiler checks for both Node and Web.
- `pnpm lint`: Run ESLint.
- `pnpm format`: Format codebase with Prettier.

## Development Conventions

### Coding Style

- **Naming**: `PascalCase` for React component folders/files; `kebab-case` for utility and main-process modules.
- **Formatting**: 2-space indentation, no semicolons, single quotes (managed by Prettier).
- **TypeScript**: Strict typing is preferred. Shared types should live in `src/shared/domain.ts`.

### IPC and Security

- Always use typed IPC channels defined in `src/shared/ipc-channels.ts`.
- Keep renderer access limited to preload-exposed APIs. No direct Node/Electron access in renderer.

### UI/UX

- Use Vanilla CSS with custom properties for colors and typography.
- Prefer explicit composition over complex inheritance.

## Testing Guidelines

Currently, the project relies on manual verification and static analysis (`pnpm typecheck`, `pnpm lint`). When adding tests, colocate them with the source (e.g., `module.test.ts`) and update `package.json`.

## Agent Collaboration Guidelines

- **Research First**: Always inspect relevant files and propose a plan before implementation.
- **Surgical Edits**: Use targeted `replace` calls. Maintain idiomatic quality and consistency.
- **Verification**: Verify changes using `pnpm typecheck` and `pnpm lint`.
- **Clean Code**: Prioritize KISS and YAGNI. Keep components and services focused.
- **Documentation**: Update `GEMINI.md` or `AGENTS.md` when introducing new architectural patterns or major changes.
