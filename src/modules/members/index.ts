// Workspace members and roles (capability 1).
// Mandatory route shape per ADR-0003 §A: read the workspace id from the path only, load
// the record, authorize, then parse the body. §E: this module owns only this folder.
import type { Hono } from 'hono';
import { requireMember } from '../../core/auth.js';
import { badRequest, conflict, notFound } from '../../core/http.js';
import { findUser, memberships, workspaces } from '../../core/store.js';
import type { Role } from '../../core/types.js';

interface MemberView {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

const ROLES: ReadonlyArray<Role> = ['owner', 'member'];

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function membersOf(workspaceId: string): MemberView[] {
  return memberships
    .filter((membership) => membership.workspaceId === workspaceId)
    .map((membership) => {
      const user = findUser(membership.userId);
      // Seed and this route's own write path guarantee every membership references a
      // real user (no user creation in this slice; see the ticket's scope).
      return { id: user!.id, name: user!.name, email: user!.email, role: membership.role };
    });
}

export function register(app: Hono): void {
  app.get('/api/workspaces/:id/members', (c) => {
    // Step 1-2: path-only id, load the leaf record.
    const workspace = workspaces.find((item) => item.id === c.req.param('id'));
    if (!workspace) throw notFound();
    // Step 3 is trivial here: a workspace is its own tenant root, nothing to walk up to.
    // Step 4: any member may list.
    requireMember(c, workspace.id);
    // Step 6.
    return c.json({ members: membersOf(workspace.id) });
  });

  app.post('/api/workspaces/:id/members', async (c) => {
    const workspace = workspaces.find((item) => item.id === c.req.param('id'));
    if (!workspace) throw notFound();
    // Step 4: only an owner may add a member. Authorization happens before the body is
    // parsed (ADR-0003 §A step order) — requireMember runs first, parsing is below.
    requireMember(c, workspace.id, 'owner');

    // Step 5: only now parse and validate the request body.
    const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (raw.workspaceId !== undefined) {
      throw badRequest('workspaceId is set by the path, not the body');
    }
    if (typeof raw.userId !== 'string' || raw.userId.length === 0) {
      throw badRequest('userId is required');
    }
    if (!isRole(raw.role)) {
      throw badRequest("role must be 'owner' or 'member'");
    }

    const user = findUser(raw.userId);
    if (!user) throw badRequest('userId must name an existing user');

    const existing = memberships.find(
      (membership) => membership.workspaceId === workspace.id && membership.userId === user.id,
    );
    if (existing) throw conflict('This user is already a member');

    // Append-only: this is the shared core array exported by src/core/store.ts
    // (ADR-0003 §C), appended to with push only — never splice, index assignment or sort.
    memberships.push({ workspaceId: workspace.id, userId: user.id, role: raw.role });

    // Step 6.
    return c.json({ members: membersOf(workspace.id) }, 201);
  });
}
