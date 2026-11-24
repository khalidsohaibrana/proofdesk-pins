// Core domain types shared by every module. See ADR-0002.

export type Role = 'owner' | 'member';

export interface User { readonly id: string; readonly name: string; readonly email: string }
export interface Workspace { readonly id: string; readonly name: string }
export interface Membership { readonly workspaceId: string; readonly userId: string; readonly role: Role }
export interface Project { readonly id: string; readonly workspaceId: string; readonly name: string }

/** An immutable file version inside a submission. Comments pin to a version, never to "the latest". */
export interface AssetVersion {
  readonly id: string;
  readonly submissionId: string;
  readonly number: number;
  readonly title: string;
  readonly imageUrl: string;
  readonly createdAt: string;
}

export interface Submission {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly title: string;
  readonly createdAt: string;
}

/** Who is calling: a workspace user, or nobody. Guest access is added by the guest-links module. */
export type Actor = { readonly kind: 'user'; readonly user: User } | { readonly kind: 'anonymous' };
