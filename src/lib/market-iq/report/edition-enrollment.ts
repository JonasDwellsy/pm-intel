export type EditionEnrollmentCheckId =
  | "commercial_access"
  | "brand"
  | "scope"
  | "source"
  | "baseline"
  | "enrollment";

export type EditionEnrollmentCheck = {
  id: EditionEnrollmentCheckId;
  label: string;
  passed: boolean;
  detail: string;
  remedyHref: string | null;
  remedyLabel: string | null;
};

export type EditionEnrollmentReadiness = {
  checks: EditionEnrollmentCheck[];
  prerequisiteChecks: EditionEnrollmentCheck[];
  blockers: EditionEnrollmentCheck[];
  prerequisitesPassed: boolean;
  enrolled: boolean;
  readyForScheduler: boolean;
};

export function buildEditionEnrollmentReadiness(input: {
  hasCommercialAccess: boolean;
  hasBrandProfile: boolean;
  onboardingCompleted: boolean;
  hasSavedGeography: boolean;
  hasSavedSegment: boolean;
  sourceIsAuthoritative: boolean;
  sourceAvailableThrough: string | null;
  hasPublishedBaseline: boolean;
  recurringEditionsEnabled: boolean;
}): EditionEnrollmentReadiness {
  const scopePassed = input.onboardingCompleted && input.hasSavedGeography && input.hasSavedSegment;
  const checks: EditionEnrollmentCheck[] = [
    {
      id: "commercial_access",
      label: "Cleveland access",
      passed: input.hasCommercialAccess,
      detail: input.hasCommercialAccess
        ? "This workspace has commercial or enterprise access to Cleveland Market IQ."
        : "Provision Cleveland Market IQ access before enrolling this workspace.",
      remedyHref: input.hasCommercialAccess ? null : "/market-iq/subscribe",
      remedyLabel: input.hasCommercialAccess ? null : "Review access",
    },
    {
      id: "brand",
      label: "PM brand",
      passed: input.hasBrandProfile,
      detail: input.hasBrandProfile
        ? "Future editions will use the saved PM identity and colors."
        : "Save the PM identity that recipients should see on every edition.",
      remedyHref: input.hasBrandProfile ? null : "/market-iq/get-started?step=1",
      remedyLabel: input.hasBrandProfile ? null : "Add PM brand",
    },
    {
      id: "scope",
      label: "Saved market scope",
      passed: scopePassed,
      detail: scopePassed
        ? "At least one Cleveland geography and product segment are saved."
        : "Complete activation with at least one geography and one product segment.",
      remedyHref: scopePassed ? null : "/market-iq/get-started?step=2",
      remedyLabel: scopePassed ? null : "Complete scope",
    },
    {
      id: "source",
      label: "Authoritative Trends IQ",
      passed: input.sourceIsAuthoritative,
      detail: input.sourceIsAuthoritative
        ? `The report source is authoritative${input.sourceAvailableThrough ? ` through ${input.sourceAvailableThrough}` : ""}.`
        : "Authoritative Trends IQ is unavailable. Preview evidence cannot trigger a recurring draft.",
      remedyHref: null,
      remedyLabel: null,
    },
    {
      id: "baseline",
      label: "Reviewed launch baseline",
      passed: input.hasPublishedBaseline,
      detail: input.hasPublishedBaseline
        ? "A published baseline exists for comparison with the next reporting period."
        : "Publish the reviewed launch baseline before recurring comparisons begin.",
      remedyHref: input.hasPublishedBaseline ? null : "/market-iq/report",
      remedyLabel: input.hasPublishedBaseline ? null : "Review baseline",
    },
    {
      id: "enrollment",
      label: "Recurring draft enrollment",
      passed: input.recurringEditionsEnabled,
      detail: input.recurringEditionsEnabled
        ? "The daily scheduler may create one private draft when Trends IQ advances."
        : "Enrollment is off. No scheduled run will evaluate this workspace.",
      remedyHref: null,
      remedyLabel: null,
    },
  ];
  const prerequisiteChecks = checks.filter((check) => check.id !== "enrollment");
  const blockers = prerequisiteChecks.filter((check) => !check.passed);
  const prerequisitesPassed = blockers.length === 0;
  return {
    checks,
    prerequisiteChecks,
    blockers,
    prerequisitesPassed,
    enrolled: input.recurringEditionsEnabled,
    readyForScheduler: prerequisitesPassed && input.recurringEditionsEnabled,
  };
}
