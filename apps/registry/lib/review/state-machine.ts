/**
 * Review state machine for `PluginVersion.reviewState` (Req 1.1, 1.8).
 *
 * Allowed transitions are encoded as a whitelist; any attempt outside this
 * set throws `ReviewStateMachineViolation`. Higher-level handlers (admin
 * publish / take-down / developer cancel routes) map domain actions to the
 * concrete `(from, to)` pair and call `assertReviewTransition` before
 * mutating state.
 */

export type ReviewState =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "DEPRECATED"
  | "TAKEN_DOWN";

export class ReviewStateMachineViolation extends Error {
  readonly from: ReviewState;
  readonly to: ReviewState;

  constructor(from: ReviewState, to: ReviewState) {
    super(`Illegal review state transition: ${from} -> ${to}`);
    this.name = "ReviewStateMachineViolation";
    this.from = from;
    this.to = to;
  }
}

const TRANSITIONS: ReadonlyMap<ReviewState, ReadonlySet<ReviewState>> = new Map<
  ReviewState,
  ReadonlySet<ReviewState>
>([
  ["DRAFT", new Set<ReviewState>(["SUBMITTED"])],
  // Developer can cancel a SUBMITTED draft; admin can claim it.
  ["SUBMITTED", new Set<ReviewState>(["IN_REVIEW", "APPROVED", "DRAFT"])],
  ["IN_REVIEW", new Set<ReviewState>(["APPROVED", "REJECTED"])],
  // Reject feedback re-opens a fresh DRAFT (Req 1.6).
  ["REJECTED", new Set<ReviewState>(["DRAFT"])],
  // Approved versions are published by admin or hard-pulled in emergencies.
  ["APPROVED", new Set<ReviewState>(["PUBLISHED", "TAKEN_DOWN"])],
  ["PUBLISHED", new Set<ReviewState>(["DEPRECATED", "TAKEN_DOWN"])],
  ["DEPRECATED", new Set<ReviewState>(["TAKEN_DOWN"])],
  // Terminal: TAKEN_DOWN is non-recoverable in this pipeline.
  ["TAKEN_DOWN", new Set<ReviewState>()],
]);

export function isReviewTransitionAllowed(
  from: ReviewState,
  to: ReviewState,
): boolean {
  if (from === to) {
    return true;
  }
  return TRANSITIONS.get(from)?.has(to) ?? false;
}

export function assertReviewTransition(from: ReviewState, to: ReviewState): void {
  if (!isReviewTransitionAllowed(from, to)) {
    throw new ReviewStateMachineViolation(from, to);
  }
}

export function listAllowedTransitions(from: ReviewState): ReviewState[] {
  return [...(TRANSITIONS.get(from) ?? [])];
}
