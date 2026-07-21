# Kairos File Structure

Updated: 2026-07-19

This document describes source code and project assets. It intentionally does not expand `node_modules/`, `.git/`, or `release/win-unpacked/`.

## Technology Stack

| Area | Technology |
| --- | --- |
| Desktop runtime | Electron 36, main process, preload bridge, renderer process |
| Renderer | Native HTML, CSS, DOM JavaScript, Tailwind CSS build output |
| Desktop security | `contextIsolation`, sandboxed renderer, narrow preload APIs |
| Data | JSON primary files, optional `node:sqlite` mirror, migrations and backups |
| AI | OpenAI SDK, Volcengine Ark Runtime, LangChain, LangGraph, Zod |
| Music and network | NeteaseCloudMusicApi, Firecrawl, local music metadata parsing |
| Attachments | `pdfjs-dist`, Mammoth, JSZip |
| Testing | Node built-in `node:test` |
| Build and release | pnpm, Electron Builder, asar, Windows NSIS and portable artifacts |

## Root

| Path | Purpose |
| --- | --- |
| `app/` | Renderer pages, features, shared UI, and runtime visual assets. |
| `electron/` | Main-process code, preload API, services, data access, migrations, and tests. |
| `scripts/` | Local development launcher and environment diagnostics. |
| `docs/` | Current product, design, release, task, and structure documentation. |
| `references/` | Historical design/reference material; not packaged into the application. |
| `release/` | Generated Windows release artifacts and `win-unpacked` verification build. |
| `package.json` | Scripts, dependencies, Electron entry point, and packaging configuration. |
| `start-kairos.cmd` / `start-kairos.ps1` | Windows development launchers. |

## Renderer: `app/`

| Path | Purpose |
| --- | --- |
| `pages/calendar/index.html` | Main calendar view and desktop shell entry page. |
| `pages/schedule/index.html` | Standalone schedule page. |
| `pages/habits/index.html` | Habit check-in page. |
| `pages/notes/index.html` | Notes and mood page. |
| `pages/music/index.html` | Local music and NetEase Cloud Music page. |
| `pages/ai-chat/index.html` | Separate AI chat window. |
| `pages/pet/index.html` | Separate desktop companion window. |
| `features/calendar/` | Calendar date core, schedule interactions, date-range styling. |
| `features/habits/` | Habit data core and habit page interactions. |
| `features/notes/` | Dated note/mood core and note page interactions. |
| `features/reminders/` | Reminder rules, reminder behavior, and reminder styling. |
| `features/settings/` | Settings dialog behavior and styling. |
| `features/assistant/` | AI chat window behavior and styling. |
| `shell/navigation/` | Shared navigation shell and embedded-page routing. |
| `shell/player/` | Shared bottom music player and player styling. |
| `shared/styles/` | Global theme variables and main calendar layout styles. |
| `assets/calendar-backgrounds/` | Calendar background images. Add selectable backgrounds here. |
| `assets/pets/desk-pet.png` | Runtime desktop companion image. |
| `assets/icons/netease-format.ico` | Windows and NetEase Cloud Music icon. |
| `assets/fonts/` | Bundled font files and font declarations. |
| `assets/styles/` | Tailwind input and generated CSS. |

## Desktop Process: `electron/`

| Path | Purpose |
| --- | --- |
| `main/index.js` | Electron startup, windows, menus, lifecycle, and IPC registration. |
| `preload/index.cjs` | Safe `window.kairosDesktop` API exposed to renderer pages. |
| `services/ai/` | Providers, agent runtime, conversation store, context manager, and tools. |
| `services/music/` | Local library and NetEase Cloud Music service. |
| `services/documents/` | Attachment persistence and document parsing. |
| `services/web/` | External web search service. |
| `data/app-state/` | App-state schema, repositories, backups, and adapters. |
| `data/sqlite/` | Optional SQLite mirror and query/index layer. |
| `data/settings/` | Atomic settings repository with SQLite recovery. |
| `migrations/` | One-time JSON-to-SQLite migration logic. |
| `scripts/audit/` | App-state and desktop user-data health audit CLIs. |
| `scripts/release/` | Release manifest and installer smoke-test scripts. |
| `tests/unit/` | Core data, date, habit, note, reminder, and settings tests. |
| `tests/integration/` | AI, services, static renderer contract, and web-search tests. |
| `tests/distribution/` | Packaged artifact and startup smoke tests. |

## Runtime Data

User data remains outside the repository at `C:\Users\lenovo\AppData\Roaming\Kairos` by default. It contains `app-state.json`, `ai-data.json`, music and settings state, attachments, backups, and the optional `kairos.sqlite` mirror. Refactoring source folders must not change these paths or data formats.

## Commands

| Command | Purpose |
| --- | --- |
| `corepack pnpm dev` | Start Kairos from source. |
| `corepack pnpm check` | Syntax checks and all tests. |
| `corepack pnpm pack` | Rebuild `release/win-unpacked`. |
| `corepack pnpm release:manifest` | Refresh release artifact hashes and sizes. |
| `corepack pnpm verify:dist` | Verify packaged artifacts and startup smoke tests. |
