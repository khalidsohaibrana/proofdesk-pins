# ADR-0002: Stack and module structure

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Product owner (human)

## Context
This slice must be small, quick to test, and buildable by up to five agents in parallel without merge conflicts.

## Decision
- **Runtime and HTTP:** Node.js 20, TypeScript (strict), Hono.
- **Data:** in-memory collections. Shared core data lives in `src/core/store.ts`. Each feature keeps its own collections inside its own module folder. No database in this slice.
- **Modules:** every feature is a folder `src/modules/<name>/` whose `index.ts` exports `register(app)`. The app discovers modules automatically, so **no ticket edits a shared routes file**.
- **Identity:** a demo header `x-user-id` names the caller (`src/core/auth.ts`). Authentication is out of scope; **authorization is real** and enforced server-side with `requireMember`.
- **Errors:** JSON `{ error: { code, message } }` via `src/core/http.ts`.
- **UI:** static HTML/CSS/JS in `public/`, no framework.
- **Tests:** Vitest for unit and API tests (in-process via `app.request`), Playwright for end-to-end tests at desktop and phone width. **Every E2E run is video-recorded**; that recording is the feature-run evidence required before merge.
- **No new runtime dependencies** without a ticket that names them.

## Consequences
- Five tickets can be built in parallel if each stays inside its own module folder.
- Data resets on restart, which is acceptable for this slice.
- Moving to a real database later is a new ADR.
