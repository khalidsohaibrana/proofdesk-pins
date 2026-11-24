# ADR-0003: Access, guest links, immutability and pin coordinates

- **Status:** **Accepted**
- **Date:** 2026-11-24 · **Accepted:** 2026-11-24
- **Deciders:** Drafted by Atlas (solution architect) · **accepted by:** Human product owner — "approved", 2026-11-24, in reply to the supervisor's decision request covering this ADR and all five of its defaults
- **Requires human acceptance:** yes — this ADR decides security, tenancy behaviour visible in the API, and what "final" means for an approval record. It also answers the two questions the brief leaves open. **All five items under "Needs the product owner's decision" were accepted as their stated defaults.**

## Context

`product/brief.md` leaves two questions open on purpose: *how tenant isolation is enforced everywhere*, and *exactly what "can't be changed" means for comments, approvals and versions*. `docs/delivery/project-profile.md` binds four invariants we may not change. ADR-0002 (Accepted) fixes the stack: Node 20, TypeScript strict, Hono, in-memory collections, demo `x-user-id` identity, auto-discovered `src/modules/<name>/index.ts`, static `public/`, Vitest + Playwright, no unnamed runtime dependencies.

Five capabilities are to be built by five builders **in parallel**, one ticket each, each confined to its own module folder. Today the only authorization primitive is `requireMember(c, workspaceId, role?)` and `Actor` is `user | anonymous`. Three forces collide:

1. **Guest access has no seam.** Capabilities 3 (pinned comments) and 4 (approval decisions) must work for a client who holds a valid link and has no account. Capability 2 owns guest links. On today's code all three tickets would have to edit `src/core/auth.ts`.
2. **`public/` is a shared namespace.** The approval control belongs *on* the review page, which capability 3 owns. `public/index.html` and `tests/helpers.ts` are single files that four or five tickets would each want a line in.
3. **Tenancy is a per-route discipline, not a library.** Every route can leak if it authorizes before it knows which workspace the record belongs to. Discipline only survives five independent builders if it is written down as one mandatory shape with a named test pair.

The honest consequence is stated up front, in **Decision F**: perfect five-way parallelism from a standing start is not achievable. One tiny core-and-shell ticket must land first. After it lands, five-way parallelism is real, with **zero** shared paths.

## Options considered

1. **Each of tickets 2, 3 and 4 extends `src/core/auth.ts` as it needs.** Simplest to plan, guaranteed three-way merge conflict in the single most security-sensitive file in the repo, and reviewers would see three different guest models. Rejected.
2. **Guest verification lives wholly inside the guest-links module; comments and approvals import it.** No core change, but tickets 3 and 4 then cannot compile, let alone be tested, until ticket 2 merges — and they import another module's internals, which ADR-0002's module boundary exists to prevent. Rejected.
3. **Guest links ticket also lands the shared seam.** One owner, coherent. But it sequences 3 and 4 behind a ticket that is itself substantial (create/expire/revoke + UI), so the critical path is long and two of five builders idle. Rejected.
4. **A small, first, core-only "access seam and shell" ticket (T0), then five truly parallel tickets.** One short sequencing step on a ticket with no product surface, after which the five capability tickets share no file at all. The same seam doubles as the test seam, so tickets 3 and 4 can test guest paths without ticket 2 existing. **Chosen.**
5. **Resolution-independent pins as percentages of the viewport, or as pixels plus a stored natural size.** Both break invariant 4 the moment the image is scaled or the phone rotates. Rejected in favour of fractions of the image's own rendered box.

## Decision

### A. Tenant isolation (invariant 1), enforced server-side

**The one mandatory route shape.** Every workspace-scoped route in every module follows these steps in this order. No step may be reordered or skipped.

1. **Read identifiers from the URL path only.** A `workspaceId` is never read from a query string, header or body for the purpose of deciding access or scoping a query. If a request body contains a `workspaceId`, `submissionId` or `versionId` field that the path already determines, the route responds `400 bad_request` rather than ignoring it — silent ignoring is how a client comes to believe it works.
2. **Load the leaf record by its path id.** Not found → `notFound()`.
3. **Walk up to the owning `Submission`** by following stored foreign keys only: comment → `versionId` → `AssetVersion.submissionId` → `Submission`, and `Submission.workspaceId` is the tenant. The workspace is *always* derived from the record being touched, never supplied by the caller.
4. **Authorize**, via `requireSubmissionAccess(c, submission, action)` (Decision B) — or `requireMember(c, workspace.id, 'owner')` for the workspace-administration routes in capability 1. Authorization is **never** called before step 3, because before step 3 there is no workspace to authorize against.
5. **Only now parse and validate the request body.**
6. Act, and return.

**What a non-member sees.** `forbidden()` keeps its `'Not found'` default message, but the message alone is not enough: today a cross-tenant id returns `403` while a nonexistent id returns `404`, and that difference is a working id-enumeration oracle across tenants. The brief says one studio must never see another studio's data, and the existence of an id is data. So:

- **A tenancy miss returns `404` with code `not_found` and message `'Not found'`** — byte-identical to a record that does not exist. T0 changes the single `if (!membership) throw forbidden();` line in `src/core/auth.ts` to `throw notFound();`, and updates the assertion in `tests/unit/core.test.ts` from `403` to `404`.
- **`403 forbidden` is reserved for role denials inside a workspace the caller is already known to belong to** — i.e. `forbidden('Only workspace owners can do this')`. That leaks nothing, because membership is already established.
- `401 unauthorized` stays for "no `x-user-id` and no guest token at all".
- `410 gone` is deliberately **unused** in this slice: using it for an expired guest link would tell a holder of a guessed token that the token was once real.

**Collections.** The rule that makes cross-tenant leakage impossible for list endpoints: **no collection endpoint accepts a tenant or parent identifier from anywhere but its own path, and every collection endpoint is nested under a resource whose workspace is derivable by step 3.** Concretely, `GET /api/versions/:versionId/comments` is legal; `GET /api/comments?workspaceId=…` is forbidden and must not be created. A module's collection filter is always `item.versionId === version.id` (or `=== submission.id`) for a parent that has already passed step 4 — never a filter on a client-supplied workspace. There is no "list everything I can see" endpoint in this slice; if one is ever needed it is a new ADR.

**The mandatory test pair.** Every authorization change ships both, in the ticket's own `tests/unit/<module>.test.ts`:

- **Allowed path:** a member of the owning workspace (`u-sam` in `w-north`) performs the action on `s-ground-floor` / `v-ground-1` and gets `2xx` with the expected body.
- **Denied path:** a member of the *other* workspace (`u-rhea` in `w-south`) performs the identical request and gets exactly `404`, body `{ error: { code: 'not_found', message: 'Not found' } }`, **and** a follow-up read as the legitimate member proves nothing changed.

Routes that guests can reach ship two more: a valid-grant allowed path, and a wrong-submission grant denied path (`404`). Anonymous-with-no-credentials gets `401`.

### B. The guest access seam

**Shape of the seam.** One new core file, `src/core/access.ts`, holds the *verification and authorization* of guest access. The guest-links module holds the *issuing, expiry and revocation* of links and its own `GuestLink` collection. Core never imports a module; the module registers a resolver function into core at `register()` time. Dependency direction stays clean, and the shared-file surface is one file that exactly one ticket ever writes.

`src/core/access.ts` — **final contents, owned and landed by T0, read-only for everyone afterwards:**

```ts
import type { Context } from 'hono';
import type { Role, Submission } from './types.js';
import { requireMember } from './auth.js';
import { notFound } from './http.js';

/** The header a guest presents. Guest tokens are never read from a query string, path or body. */
export const GUEST_HEADER = 'x-guest-token';

/** What a caller may do on one submission. Guests never hold 'manage'. */
export type Action = 'view' | 'comment' | 'decide' | 'manage';

/** A resolved, least-privilege capability: one workspace, one submission, a fixed action set. */
export interface GuestGrant {
  readonly kind: 'guest';
  /** Audit handle for the link. Safe to log and to store on records. Never the token. */
  readonly linkId: string;
  readonly workspaceId: string;
  readonly submissionId: string;
  readonly actions: ReadonlyArray<Action>;
  /** Display name for the record, e.g. 'Guest reviewer' or the client name the member typed. */
  readonly label: string;
}

/**
 * Resolves a raw guest token to a grant.
 * MUST return `undefined` — indistinguishably — when the token is unknown, malformed,
 * expired or revoked. Callers must never be able to tell these cases apart.
 */
export type GuestResolver = (token: string) => GuestGrant | undefined;

/**
 * Installs the resolver. In production the guest-links module calls this once from its
 * `register(app)`. Last call wins; the returned function restores the previous resolver,
 * which is how tests install a fake grant. Fails closed: until something is installed,
 * the default resolver returns `undefined` for every token.
 */
export function setGuestResolver(resolve: GuestResolver): () => void;

/** The grant for this request, or `undefined`. Reads `x-guest-token` and nothing else. */
export function guestGrantOf(c: Context): GuestGrant | undefined;

/** Who was allowed. Records that must name their author store these fields, never the token. */
export type Principal =
  | { readonly kind: 'user'; readonly userId: string; readonly role: Role; readonly label: string }
  | { readonly kind: 'guest'; readonly linkId: string; readonly label: string };

/**
 * The single authorization call every submission-scoped route makes, at step 4 of the
 * mandatory route shape, with a `submission` that was derived from the record being touched.
 *
 * Semantics, in order:
 *  1. If the `x-guest-token` header is present, the guest path is taken and there is NO
 *     fallback to member authorization — a present-but-bad token is a denial, never an
 *     opportunity to be re-judged as a member. (Prevents a confused-deputy escalation.)
 *     Denies with `notFound()` when: the resolver returns undefined; or
 *     grant.submissionId !== submission.id; or grant.workspaceId !== submission.workspaceId;
 *     or !grant.actions.includes(action). All four are the same 404 'Not found'.
 *  2. Otherwise delegates to `requireMember(c, submission.workspaceId)`: `401` when no
 *     `x-user-id`, `404` when the user is not a member of that workspace. Every member of
 *     the owning workspace holds every action, including 'manage'.
 *
 * Throws (never returns) on denial. Returns the `Principal` on success.
 */
export function requireSubmissionAccess(c: Context, submission: Submission, action: Action): Principal;
```

Nothing else is added to core. `Actor` in `src/core/types.ts` is **not** changed: it stays the *authentication* answer (`user | anonymous`), and `Principal` is the *authorization* answer. T0 adds exactly two read helpers to `src/core/store.ts`, which capabilities 3, 4 and 5 all need and would otherwise each add:

```ts
export const findAssetVersion = (id: string): AssetVersion | undefined;
export const versionsOf = (submissionId: string): ReadonlyArray<AssetVersion>; // ascending by number
```

**How modules 3 and 4 consume it without touching module 2.** They import `requireSubmissionAccess` and `Action` from `../../core/access.js` and call it at step 4 with `'comment'` and `'decide'` respectively. They never import the guest-links module, never see a token, never see `GuestLink`. For tests, each registers its own fake grant in its own test file — the seam *is* the test seam:

```ts
const restore = setGuestResolver((t) => (t === 'test-token'
  ? { kind: 'guest', linkId: 'gl-test', workspaceId: 'w-north', submissionId: 's-ground-floor',
      actions: ['view', 'comment', 'decide'], label: 'Test client' }
  : undefined));
// ... afterEach(restore)
```

So tickets 3 and 4 are **fully testable without ticket 2 existing**. Shared-file surface between the five capability tickets: zero.

**What tickets 3 and 4 may assume** about the seam, and nothing beyond it: the exact signatures above; that a grant is scoped to exactly one submission; that a member always out-ranks any grant on their own workspace's records; that denial always arrives as a thrown `404 not_found 'Not found'`; and that `Principal.label` is safe to store on a record and show in the UI.

**What ticket 2 may not change:** `src/core/access.ts` after T0 lands it. Ticket 2 calls `setGuestResolver` from its `register(app)` and implements `GuestResolver` inside its own folder. If ticket 2 finds the seam wrong, that is a new ADR, not an edit.

**Token shape and comparison.** Generated with the Node built-in `node:crypto` (no new dependency): `randomBytes(32).toString('base64url')` — 256 bits, URL-safe. The plaintext token is returned **exactly once**, in the `201` response to link creation, and is never stored. The `GuestLink` record stores `tokenHash = createHash('sha256').update(token).digest('hex')`. Resolution hashes the presented token and looks the link up by hash; the final equality check uses `timingSafeEqual` over the two equal-length hash buffers. Hash lookup, not a scan over secrets, so there is no length- or position-dependent timing signal on the secret itself.

**Expiry and revocation.** `GuestLink { id, workspaceId, submissionId, tokenHash, label, createdBy, createdAt, expiresAt, revokedAt: string | null }`, living in the guest-links module. The resolver returns `undefined` when `revokedAt !== null` or `Date.parse(expiresAt) <= Date.now()`. `revokedAt` is one-way: once set it is never unset, and revocation is an immutable replacement of the array element, not a field mutation. Default lifetime **7 days**, caller may pass a shorter `expiresAt`, hard maximum **30 days** (see "Needs the product owner's decision").

**May a guest approve? Yes.** The brief's first paragraph is explicit about the product: "We want **clients** to drop a pin exactly where they mean, write a comment, and **formally approve the design**", and capability 2 exists precisely because the client "has no account". A guest link therefore grants the fixed set `['view', 'comment', 'decide']`. It never grants `'manage'`, so a guest can never add members, issue links or upload versions. Link creation takes **no action options** — per-link permission tuning is a capability the brief does not ask for and we are not building it.

**Guest tokens and anything that logs.** The token is sensitive and is treated as such:

- **Header only** on the wire to the server (`x-guest-token`). Never a query parameter, never a path segment, never a body field — any of those would land it in access logs, `Referer` headers and browser history.
- The shareable link puts it in the **URL fragment**: `/review.html?submission=<submissionId>#t=<token>`. Fragments are never sent to the server and never appear in server logs or `Referer`. The page reads `location.hash`, holds the token in a module variable, and sends it as the header. The page must **not** write the token into `localStorage` or into the document.
- Never echoed in a response body, and never interpolated into an error message.
- This slice has no request-logging middleware. If one is ever added it must redact `x-guest-token`, and adding it is a security-reviewed change.
- `linkId` is the audit handle: it is what gets stored on comments and decisions and what the UI shows.

### C. Immutability (invariants 2 and 3) — exactly what "can't be changed" means

A general rule for all three record types: every field is declared `readonly`, every collection is a module-local array appended to with `push` only — never `splice`, never index assignment, never `pop`, never `sort` in place — and no module exports any function that mutates another module's records. "No PATCH/PUT/DELETE route exists" is checked by test, because an unregistered route in Hono answers `404`, and that is the assertion.

**Comment** (owned by capability 3)

| Verb and path | Allowed? |
|---|---|
| `POST /api/versions/:versionId/comments` | yes — action `'comment'` |
| `GET /api/versions/:versionId/comments` | yes — action `'view'` |
| `PATCH` / `PUT` / `DELETE` on any comment path | **must never exist** |

Strictly append-only. Test: create a comment; `GET` the collection and keep the body; fire `PATCH`, `PUT` and `DELETE` at `/api/comments/:id` and at `/api/versions/:versionId/comments/:id` and assert each is `404`; re-`GET` the collection and `toEqual` the kept body.

**Approval decision** (owned by capability 4)

| Verb and path | Allowed? |
|---|---|
| `POST /api/versions/:versionId/decisions` | yes — action `'decide'` |
| `GET /api/submissions/:id/decisions` | yes — action `'view'`; returns every decision across the submission's versions, each carrying its `versionId` |
| `PATCH` / `PUT` / `DELETE` on any decision path | **must never exist** |

**The target is the asset version.** A decision is `{ id, versionId, submissionId, outcome: 'approved' | 'changes_requested', note, decidedByKind, decidedById, decidedByLabel, decidedAt }`, all `readonly`. Exactly one decision may exist per `versionId`. Rationale: comments and pins are version-scoped by invariant 3, a verdict on v1 says nothing about v2, and a submission-wide terminal decision would make capability 5 pointless — you could never decide on the new version you just uploaded. A second `POST` for a `versionId` that already has a decision returns **`409`, code `conflict`** (`conflict('This version already has a final decision')` from `src/core/http.ts`), regardless of whether the second outcome matches the first and regardless of who sends it. Test: `POST` → `201`; `POST` again → `409` with `error.code === 'conflict'`; `GET` the record and assert exactly one decision, deep-equal to the first response.

**Asset version** (owned by capability 5)

| Verb and path | Allowed? |
|---|---|
| `POST /api/submissions/:id/versions` | yes — action `'manage'`, so members only, never guests |
| read via the existing `GET /api/submissions/:id` | yes |
| `PATCH` / `PUT` / `DELETE` on any version path | **must never exist** |

Append-only: `assetVersions.push({ ... })` into the core array, with `number = (max existing number for that submission) + 1` and a fresh `id`. No existing element is read-modified-written.

**How a new version cannot move, hide or re-parent earlier comments.** Three structural facts, each with an assertion:

1. A comment stores `versionId` as a `readonly` field and nothing anywhere writes it after creation. The comments collection lives inside capability 3's folder and the module exports **no mutator**, so capability 5's code physically cannot reach it. A new version simply has an empty comment list.
2. Ordering and selection are derived, never stored as a pointer: `versionsOf(submissionId)` sorts ascending by `number`, and there is no "latest version" field on `Submission` for anyone to repoint. The review page reads a `versionId` from the URL.
3. Test (capability 5's denied-path-adjacent regression, required by invariant 3): as `u-sam`, snapshot `GET /api/submissions/s-ground-floor` and `GET /api/versions/v-ground-1/comments` after seeding a comment and a decision on `v-ground-1`; `POST /api/submissions/s-ground-floor/versions`; re-read both. Assert the `v-ground-1` object is `toEqual` the snapshot, the `v-ground-1` comment array is `toEqual` the snapshot, the decision on `v-ground-1` is unchanged, the new version appears last with `number === 2`, and `GET /api/versions/<new>/comments` is `[]`.

### D. Pin coordinates (invariant 4)

**Stored shape**, on every comment, required — a comment without a pin is rejected:

```ts
readonly pin: { readonly x: number; readonly y: number };
```

`x` and `y` are **fractions of the drawing image's own rendered box** — `x` from its left edge, `y` from its top edge. Not the viewport, not the page, not the scroll container. That is the whole agreement between the API module and the review page.

**Validation**, server-side, at step 5 of the route shape: `pin` must be an object; `x` and `y` must each satisfy `typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1`. Anything else — missing, `null`, a string, `NaN`, `Infinity`, `-0.01`, `1.5` — is `badRequest('pin.x and pin.y must be numbers between 0 and 1')`, i.e. `400 bad_request`. Accepted values are rounded to **4 decimal places** before storing, which is well under a pixel on any plausible drawing and keeps snapshot assertions free of float noise.

**Client contract**, binding on the review page and on the E2E test: the image sits in a `position: relative` wrapper that exactly bounds it (`img { display: block; width: 100%; height: auto; }`), so the wrapper's box and the image's box are the same box. Capture is `const r = img.getBoundingClientRect(); x = clamp01((e.clientX - r.left) / r.width); y = clamp01((e.clientY - r.top) / r.height);`. Render is `style.left = x * 100 + '%'; style.top = y * 100 + '%'` with the marker translated by `-50%, -50%`. Because both directions are pure fractions of the same box, a pin lands identically at 1280px and on a Pixel 7 — the E2E test asserts exactly that, clicking at the same fractional point at both widths and comparing the stored `pin` values.

### E. Module and file ownership map

T0 lands first (Decision F). After it, **no two tickets touch the same path.**

| Ticket | Module route prefix | May create or modify — nothing else |
|---|---|---|
| **T0 · access seam and shell** (no product surface) | — | `src/core/access.ts` (new), `src/core/store.ts` (the two read helpers only), `src/core/auth.ts` (the one `forbidden()` → `notFound()` line), `tests/helpers.ts` (final shape), `tests/unit/core.test.ts`, `tests/unit/access.test.ts`, `tests/e2e/home.spec.ts`, `public/index.html` (final), `public/app.css` (new, shared tokens and phone-first layout) |
| **T1 · members and roles** | `/api/workspaces/:id/members` | `src/modules/members/**`, `tests/unit/members.test.ts`, `tests/e2e/members.spec.ts`, `public/members.html`, `public/members.js` |
| **T2 · guest review links** | `/api/submissions/:id/guest-links`, `/api/guest-links/:id/revoke` | `src/modules/guest-links/**`, `tests/unit/guest-links.test.ts`, `tests/e2e/guest-links.spec.ts`, `public/links.html`, `public/links.js` |
| **T3 · pinned comments + review page** | `/api/versions/:versionId/comments` | `src/modules/comments/**`, `tests/unit/comments.test.ts`, `tests/e2e/comments.spec.ts`, `public/review.html`, `public/review.js` |
| **T4 · approval decisions** | `/api/versions/:versionId/decisions`, `/api/submissions/:id/decisions` | `src/modules/approvals/**`, `tests/unit/approvals.test.ts`, `tests/e2e/approvals.spec.ts`, `public/decide.js` |
| **T5 · new asset versions** | `/api/submissions/:id/versions` | `src/modules/versions/**`, `tests/unit/versions.test.ts`, `tests/e2e/versions.spec.ts`, `public/versions.html`, `public/versions.js`, `public/assets/ground-floor-v2.svg` |
| **T6 · guest journey E2E** (after T2, T3, T4 merge) | — | `tests/e2e/guest-journey.spec.ts` |

**The review-page collision, engineered away.** The approval control belongs on the review page, which T3 owns. T3 therefore writes two fixed hooks into `public/review.html`, specified here so T4 never needs to edit that file:

```html
<section id="decision-slot" data-submission-id="…" data-version-id="…"></section>
<script type="module" src="/decide.js"></script>
```

T4 creates **only** `public/decide.js`, which reads those two `data-` attributes, renders into `#decision-slot`, and sends the `x-guest-token` header when `location.hash` carries `t=`. Until T4 merges, the script tag 404s — a console warning, not a broken page — and T3's E2E asserts the slot element exists, not that it is populated. `public/review.js` and `public/decide.js` must not share module state; `decide.js` re-reads what it needs from the DOM attributes.

**Other shared-path notes.**

- `public/index.html` is written once, by T0, with links to all five pages. Some links are dead in `main` until the owning ticket merges; that is accepted, and the home E2E asserts the links render, not that they resolve. **No capability ticket edits `public/index.html`.**
- `public/app.css` is T0's and frozen. Per-page styling goes in the page's own `<style>` block or in a `public/<page>.css` the ticket owns.
- `tests/helpers.ts` is written once, by T0, with the final `call` signature so that T2–T4 do not each add a field:
  `call(path, init: { method?: string; as?: string; guest?: string; body?: unknown })` — `as` sets `x-user-id`, `guest` sets `x-guest-token`. **No capability ticket edits `tests/helpers.ts`.**
- `tests/` layout: one `tests/unit/<module>.test.ts` and one `tests/e2e/<module>.spec.ts` per ticket, named after the module folder. No other file.
- `src/app.ts` auto-discovers modules (ADR-0002). **Nobody edits it.** There is no shared routes file and none may be introduced.
- `src/core/**` is T0's. After T0 merges, core is **read-only for every capability ticket**. A builder who believes core must change stops and reports to the supervisor; it becomes a new ADR, not a PR.
- **New runtime dependencies: none.** ADR-0002 already forbids any the ticket does not name, and no ticket here names one. Token generation and hashing use the Node built-ins `node:crypto`. A PR that adds a `dependencies` entry is rejected on sight and escalated to the product owner.

### F. The dependency this forces — stated plainly

**T0 must merge to `main` before T1–T5 start.** It is deliberately tiny: one new core file, two one-line core edits, the test helper, the home page and the shared stylesheet. No product surface, no new entity. It needs security review (it touches authorization) and it is the critical path, so it should be the supervisor's first and only ticket in wave 1.

After T0 merges, **T1–T5 are genuinely parallel**: no shared file, no cross-module import, no runtime dependency between them for their own tests and their own E2E. T3's and T4's guest paths are tested through `setGuestResolver`, not through T2.

The one thing that genuinely spans tickets is the real end-to-end guest journey — a member issues a link, the client opens it, pins a comment, and approves. That cannot exist until T2, T3 and T4 are all merged, so it is **T6**, a single Playwright spec in wave 3, owned by whichever builder the supervisor assigns. Do not bolt it onto T2, T3 or T4; doing so would re-create the dependency this ADR removes.

## Needs the product owner's decision

These are product and trust calls, not engineering ones. The ADR states a working default for each so builders are never blocked, but each default should be confirmed or overridden at acceptance.

1. **A decision is final per asset version, not per submission** (Decision C). Approving v1 does not prevent a decision on v2. The alternative — one terminal decision per submission, forever — is defensible from "the decision is final" but makes capability 5 undecidable. *Default: per version.*
2. **Guests may approve** (Decision B). Read straight from the brief's first paragraph, but it means a holder of a link URL can enter a binding decision with no account and no second factor. *Default: yes, with `['view','comment','decide']`.*
3. **Guest link lifetime.** The brief says links expire but gives no number. *Default: 7 days, caller may shorten, hard maximum 30 days.*
4. **How a guest is named in the permanent record.** "Who decided what" needs a name, and a guest has no account. *Default: the member types a `label` when issuing the link; absent one, decisions and comments read `'Guest reviewer'` and carry the `linkId`.*
5. **A cross-tenant request now answers `404`, not `403`** (Decision A). This changes the observable behaviour of the one existing endpoint, `GET /api/submissions/:id`, and the assertion in `tests/unit/core.test.ts`. It closes an id-enumeration oracle; it also means a legitimate member who mistypes a workspace cannot tell "not yours" from "not there".

## Consequences

**Easier.** One route shape and one authorization call for every module, so a reviewer checks five PRs against the same six steps. Tenancy denials are indistinguishable from absence, so there is no enumeration oracle to re-audit per endpoint. Immutability is structural — `readonly` fields, append-only arrays, no exported mutators, no registered mutating verbs — so the tests assert facts rather than intentions. Tickets 3 and 4 test guest behaviour without ticket 2, which is what makes the parallel wave real.

**Harder.** One sequencing step up front (T0), and a third wave for the one cross-ticket E2E. Core is frozen after T0, so a genuine gap in the seam costs an ADR rather than a quick edit — intentional, since three builders editing the authorization file is the failure this ADR exists to prevent. Dead links sit in `public/index.html` between merges.

**Follow-up tickets unblocked:** T0 unblocks T1–T5 simultaneously; T2, T3 and T4 together unblock T6. **Split into independent parallel work:** the review page (T3) and the approval control (T4) via the `#decision-slot` + `/decide.js` contract; guest-link issuance (T2) and guest-link *consumption* (T3, T4) via `setGuestResolver`.

**How we would reverse it.** Each decision is local. Per-version decision finality → change the uniqueness key and the `409` test in T4's module only. Guests may not approve → remove `'decide'` from the grant's fixed action set in T2's resolver; T4's route is unchanged. `404`-for-tenancy → one line in `src/core/auth.ts` plus one assertion. Replacing the guest seam means a new ADR superseding this one, and rewriting one core file plus the call sites in two modules.
