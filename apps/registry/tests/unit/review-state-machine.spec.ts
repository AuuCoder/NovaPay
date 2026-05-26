import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ReviewStateMachineViolation,
  assertReviewTransition,
  isReviewTransitionAllowed,
  listAllowedTransitions,
  type ReviewState,
} from "../../lib/review/state-machine";

describe("review state machine", () => {
  it("permits the canonical happy path", () => {
    const happyPath: Array<[ReviewState, ReviewState]> = [
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "IN_REVIEW"],
      ["IN_REVIEW", "APPROVED"],
      ["APPROVED", "PUBLISHED"],
      ["PUBLISHED", "DEPRECATED"],
      ["DEPRECATED", "TAKEN_DOWN"],
    ];
    for (const [from, to] of happyPath) {
      assert.equal(isReviewTransitionAllowed(from, to), true, `${from}→${to}`);
      assert.doesNotThrow(() => assertReviewTransition(from, to));
    }
  });

  it("permits SUBMITTED → DRAFT cancel and REJECTED → DRAFT redo", () => {
    assert.equal(isReviewTransitionAllowed("SUBMITTED", "DRAFT"), true);
    assert.equal(isReviewTransitionAllowed("REJECTED", "DRAFT"), true);
  });

  it("permits emergency take-down from APPROVED / PUBLISHED / DEPRECATED", () => {
    for (const from of ["APPROVED", "PUBLISHED", "DEPRECATED"] as const) {
      assert.equal(isReviewTransitionAllowed(from, "TAKEN_DOWN"), true);
    }
  });

  it("rejects illegal transitions with ReviewStateMachineViolation", () => {
    const illegalCases: Array<[ReviewState, ReviewState]> = [
      ["DRAFT", "PUBLISHED"],
      ["SUBMITTED", "PUBLISHED"],
      ["IN_REVIEW", "PUBLISHED"],
      ["PUBLISHED", "DRAFT"],
      ["TAKEN_DOWN", "PUBLISHED"],
    ];
    for (const [from, to] of illegalCases) {
      assert.equal(isReviewTransitionAllowed(from, to), false, `${from}→${to}`);
      assert.throws(
        () => assertReviewTransition(from, to),
        (error: unknown) =>
          error instanceof ReviewStateMachineViolation &&
          error.from === from &&
          error.to === to,
      );
    }
  });

  it("treats no-op transitions (same state) as allowed", () => {
    assert.equal(isReviewTransitionAllowed("DRAFT", "DRAFT"), true);
    assert.equal(isReviewTransitionAllowed("PUBLISHED", "PUBLISHED"), true);
    assert.doesNotThrow(() => assertReviewTransition("PUBLISHED", "PUBLISHED"));
  });

  it("listAllowedTransitions returns the documented outgoing set", () => {
    assert.deepEqual(listAllowedTransitions("DRAFT").sort(), ["SUBMITTED"]);
    assert.deepEqual(listAllowedTransitions("SUBMITTED").sort(), ["APPROVED", "DRAFT", "IN_REVIEW"]);
    assert.deepEqual(listAllowedTransitions("IN_REVIEW").sort(), ["APPROVED", "REJECTED"]);
    assert.deepEqual(listAllowedTransitions("APPROVED").sort(), ["PUBLISHED", "TAKEN_DOWN"]);
    assert.deepEqual(listAllowedTransitions("REJECTED").sort(), ["DRAFT"]);
    assert.deepEqual(listAllowedTransitions("PUBLISHED").sort(), ["DEPRECATED", "TAKEN_DOWN"]);
    assert.deepEqual(listAllowedTransitions("DEPRECATED").sort(), ["TAKEN_DOWN"]);
    assert.deepEqual(listAllowedTransitions("TAKEN_DOWN"), []);
  });
});
