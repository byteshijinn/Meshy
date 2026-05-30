# Meshy

Meshy is a local-first multi-agent collaboration platform. It is built around a daemon, a typed RPC surface, Markdown-as-Code skills and subagents, a provider-agnostic model gateway, and a React workspace UI.

The project direction is an agentic operating layer for development work: the UI stays thin, the daemon owns orchestration, tools are loaded on demand, and high-risk file or shell operations are guarded by explicit contracts.

## What Is In This Repository

- `src/index.ts` starts the CLI/daemon entrypoint and wires the runtime services.
- `src/core/daemon/` exposes the WebSocket RPC server, request router, and skill handlers.
- `src/core/engine/` runs the task loop and delegates tool/model work.
- `src/core/aci/` contains guarded file and command operations used by agents.
- `src/core/tool/` contains built-in tools such as hash-guarded edits and create-only writes.
- `src/core/llm/` contains the model gateway and provider capability registry.
- `src/core/rpc/contract.ts` is the shared RPC contract consumed by backend and frontend.
- `src/core/skills/` loads and validates Markdown skills from `.agent/skills/<name>/SKILL.md`.
- `src/core/subagents/` loads Markdown subagents from bundled and workspace-local locations.
- `web/` is the React/Vite UI that connects to the daemon over RPC.
- `tests/` contains the Vitest coverage for core contracts, routing, tools, skills, and subagents.

Generated folders such as `dist/`, `docs/`, and `tmp/` are intentionally not part of the committed source surface.

## Core Principles

- **Provider-agnostic model gateway**: provider-specific behavior belongs in `src/core/llm/`, not in the UI or task engine.
- **Markdown-as-Code extension model**: skills and subagents are declared as Markdown files with frontmatter and loaded only when needed.
- **Typed daemon boundary**: RPC methods, parameters, responses, and events should flow through shared contracts instead of ad hoc `any` payloads.
- **Guarded file writes**: full-file overwrite is not the default; edits should use hash guards or explicit overwrite intent.
- **Local-first safety**: workspace paths, skills, and deletion operations are constrained so agent actions do not escape expected project boundaries.

## Requirements

- Node.js `>=22`
- npm `>=10`

The repository includes `packageManager` and `engines` metadata for reproducible local installs.

## Install

```powershell
npm install
cd web
npm install
cd ..
```

## Development

Run the daemon:

```powershell
npm run dev
```

Run the web UI:

```powershell
cd web
npm run dev
```

Build the daemon package:

```powershell
npm run build
```

Build the web UI:

```powershell
cd web
npm run build
```

## Verification

```powershell
npm run typecheck
npm run test
npm run build
cd web
npm run lint
npm run build
```

Use focused tests for narrow changes, then run the broader gates before committing shared contracts, daemon handlers, tool behavior, or frontend RPC code.

## Extension Layout

Skills live at:

```text
.agent/skills/<skill-name>/SKILL.md
```

Subagents live at:

```text
.agent/subagents/<agent-name>.md
.meshy/agents/<agent-name>.md
```

These local extension folders are useful during development, but most workspace-specific generated content should remain untracked unless it is intentionally part of the product source.

## Notes For Contributors

- Do not commit media captures, temporary experiment folders, or generated build output.
- Do not replace current core files with forked copies unless the fork is confirmed to be newer and compatible with the current RPC, tool, and safety contracts.
- Prefer small, verified slices over broad rewrites.
