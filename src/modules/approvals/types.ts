// Approval decision record (ADR-0003 §C). Owned entirely by this module; no other module
// may import this file. Every field is readonly and the collection in index.ts is
// append-only — see index.ts for the enforcement.

export type DecisionOutcome = 'approved' | 'changes_requested';

export interface Decision {
  readonly id: string;
  readonly versionId: string;
  readonly submissionId: string;
  readonly outcome: DecisionOutcome;
  /** Optional free-text note. `null` when the decider left none. */
  readonly note: string | null;
  readonly decidedByKind: 'user' | 'guest';
  /** The userId for a member, the grant's linkId for a guest — never the guest token. */
  readonly decidedById: string;
  readonly decidedByLabel: string;
  readonly decidedAt: string;
}
