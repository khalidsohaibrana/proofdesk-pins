// Demo identity (ADR-0002): the caller is named by the `x-user-id` header.
// Real authentication is out of scope for this slice; authorization rules are real.
import type { Context } from 'hono';
import { findUser, membershipOf } from './store.js';
import type { Actor, Role } from './types.js';
import { forbidden, notFound, unauthorized } from './http.js';

export const USER_HEADER = 'x-user-id';

export function actorOf(c: Context): Actor {
  const id = c.req.header(USER_HEADER);
  const user = id ? findUser(id) : undefined;
  return user ? { kind: 'user', user } : { kind: 'anonymous' };
}

/** Require a signed-in workspace member (optionally with a given role). Returns the member's role. */
export function requireMember(c: Context, workspaceId: string, role?: Role): Role {
  const actor = actorOf(c);
  if (actor.kind !== 'user') throw unauthorized();
  const membership = membershipOf(workspaceId, actor.user.id);
  // Non-members get the same answer as for a missing resource: no tenant data leaks.
  if (!membership) throw notFound();
  if (role === 'owner' && membership.role !== 'owner') throw forbidden('Only workspace owners can do this');
  return membership.role;
}
