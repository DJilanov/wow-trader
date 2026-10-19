import {
  evaluatePracticalSimulatorConfirmation,
  type PracticalSimulatorConfirmationMath,
  type PracticalSimulatorConfirmationPlan,
  type PracticalSimulatorConfirmationRecord,
} from "./forever-simulator-practical-confirmation";

export interface ApprovedSimulatorConfirmationPlan {
  readonly schema: "kfc-approved-first-pass-frozen-confirmation.v1";
  readonly approvalPolicy: {
    readonly schema: "kfc-owner-approved-first-pass-margin.v1";
    readonly maximumRetainedGapFraction: 0.02;
    readonly originalMaximumRetainedGapFraction: 0.01;
    readonly selectionFromHoldoutsAllowed: false;
    readonly scope: string;
  };
  readonly originalPlan: PracticalSimulatorConfirmationPlan;
}

export interface ApprovedSimulatorConfirmationMath {
  readonly accepted: boolean;
  readonly status:
    | "accepted-owner-approved-practical-first-pass"
    | "accepted-with-disclosed-nearby-gains"
    | "outside-owner-approved-practical-margin";
  readonly originalAssessment: PracticalSimulatorConfirmationMath;
  readonly selectedArm: string;
  readonly selectedDps: number;
  readonly selectedIterations: number;
  readonly iterationsPerRange: number;
  readonly largestConservativeRetainedGapFraction: number;
  readonly maximumRetainedGapFraction: 0.02;
  readonly selectionChanged: false;
  readonly globalOptimalityProven: false;
}

/** Recomputes the approved margin without relabelling the original assessment; source/model/wire authentication is separate. */
export function evaluateApprovedSimulatorConfirmation(
  plan: ApprovedSimulatorConfirmationPlan,
  records: readonly PracticalSimulatorConfirmationRecord[],
): ApprovedSimulatorConfirmationMath {
  const policy = plan.approvalPolicy;
  if (
    plan.schema !== "kfc-approved-first-pass-frozen-confirmation.v1" ||
    Object.keys(policy).length !== 5 ||
    policy.schema !== "kfc-owner-approved-first-pass-margin.v1" ||
    policy.maximumRetainedGapFraction !== 0.02 ||
    policy.originalMaximumRetainedGapFraction !== 0.01 ||
    policy.selectionFromHoldoutsAllowed !== false ||
    typeof policy.scope !== "string" ||
    policy.scope.length === 0 ||
    policy.scope.length > 4000
  )
    throw new Error("Owner-approved confirmation policy changed");
  const originalAssessment = evaluatePracticalSimulatorConfirmation(plan.originalPlan, records);
  const accepted = originalAssessment.largestConservativeRetainedGapFraction <= 0.02;
  return {
    accepted,
    status: accepted
      ? originalAssessment.strictRetainedDominancePassed
        ? "accepted-owner-approved-practical-first-pass"
        : "accepted-with-disclosed-nearby-gains"
      : "outside-owner-approved-practical-margin",
    originalAssessment,
    selectedArm: originalAssessment.selectedArm,
    selectedDps: originalAssessment.selectedDps,
    selectedIterations: originalAssessment.selectedIterations,
    iterationsPerRange: originalAssessment.iterationsPerRange,
    largestConservativeRetainedGapFraction:
      originalAssessment.largestConservativeRetainedGapFraction,
    maximumRetainedGapFraction: 0.02,
    selectionChanged: false,
    globalOptimalityProven: false,
  };
}
