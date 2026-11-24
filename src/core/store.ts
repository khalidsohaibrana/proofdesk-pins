// In-memory data store with seed data (ADR-0002: no database in this slice).
// Modules keep their own collections in their own folder; this file holds only the shared core.
import type { AssetVersion, Membership, Project, Submission, User, Workspace } from './types.js';

const SEED_TIME = '2026-11-01T09:00:00.000Z';

export const users: ReadonlyArray<User> = [
  { id: 'u-olivia', name: 'Olivia Hart', email: 'olivia@northstudio.test' },
  { id: 'u-sam', name: 'Sam Patel', email: 'sam@northstudio.test' },
  { id: 'u-rhea', name: 'Rhea Okafor', email: 'rhea@southarch.test' },
];

export const workspaces: ReadonlyArray<Workspace> = [
  { id: 'w-north', name: 'North Studio' },
  { id: 'w-south', name: 'South Architecture' },
];

export const memberships: Membership[] = [
  { workspaceId: 'w-north', userId: 'u-olivia', role: 'owner' },
  { workspaceId: 'w-north', userId: 'u-sam', role: 'member' },
  { workspaceId: 'w-south', userId: 'u-rhea', role: 'owner' },
];

export const projects: ReadonlyArray<Project> = [
  { id: 'p-harbour', workspaceId: 'w-north', name: 'Harbour House' },
  { id: 'p-mill', workspaceId: 'w-south', name: 'Old Mill Lofts' },
];

export const submissions: Submission[] = [
  { id: 's-ground-floor', workspaceId: 'w-north', projectId: 'p-harbour', title: 'Ground floor plan', createdAt: SEED_TIME },
  { id: 's-mill-facade', workspaceId: 'w-south', projectId: 'p-mill', title: 'Facade study', createdAt: SEED_TIME },
];

export const assetVersions: AssetVersion[] = [
  { id: 'v-ground-1', submissionId: 's-ground-floor', number: 1, title: 'Ground floor plan, v1', imageUrl: '/assets/ground-floor-v1.svg', createdAt: SEED_TIME },
  { id: 'v-mill-1', submissionId: 's-mill-facade', number: 1, title: 'Facade study, v1', imageUrl: '/assets/ground-floor-v1.svg', createdAt: SEED_TIME },
];

export const findUser = (id: string): User | undefined => users.find((user) => user.id === id);
export const findSubmission = (id: string): Submission | undefined => submissions.find((item) => item.id === id);
export const membershipOf = (workspaceId: string, userId: string): Membership | undefined =>
  memberships.find((item) => item.workspaceId === workspaceId && item.userId === userId);
