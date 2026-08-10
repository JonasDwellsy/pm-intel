export interface PilotBuilding {
  label?: string;
  suppliedAddress: string;
  canonicalAddress: string;
  city: string;
  state: string;
  postalCode: string;
  dwellsyCommunityId?: string;
  isPrimary?: boolean;
}

export interface PilotAsset {
  slug: string;
  name: string;
  assetType: "multifamily" | "single_family";
  suppliedAddress: string;
  canonicalAddress: string;
  city: string;
  state: string;
  postalCode: string;
  dwellsyCommunityId?: string;
  matchStatus: "matched" | "needs_review";
  matchConfidence: number;
  readinessStatus: "monitoring" | "needs_confirmation";
  uruStatus: "unknown";
  compSetStatus: "review" | "not_started";
  observedOperatorName: string;
  sourceNote: string;
  buildings: PilotBuilding[];
  tasks: Array<{
    taskType:
      | "match_review"
      | "issue_uru"
      | "operator_outreach"
      | "comp_setup"
      | "customer_confirmation";
    note: string;
  }>;
}

const singleBuilding = (
  address: string,
  city: string,
  postalCode: string,
  dwellsyCommunityId?: string
): PilotBuilding[] => [
  {
    suppliedAddress: address,
    canonicalAddress: address,
    city,
    state: "OH",
    postalCode,
    dwellsyCommunityId,
    isPrimary: true,
  },
];

const standardTasks = (needsMatchReview = false) => [
  ...(needsMatchReview
    ? [{ taskType: "match_review" as const, note: "Confirm the Dwellsy property match and canonical address." }]
    : []),
  { taskType: "issue_uru" as const, note: "Audit unit-level URU coverage and issue missing URUs." },
  { taskType: "comp_setup" as const, note: "Review the proposed comp set before customer launch." },
  { taskType: "customer_confirmation" as const, note: "Include in the assisted onboarding confirmation call." },
];

export const CLEVELAND_PILOT_PORTFOLIO: {
  slug: string;
  name: string;
  ownerLabel: string;
  marketId: string;
  assets: PilotAsset[];
} = {
  slug: "synthetic-cleveland-owner-pilot",
  name: "Cleveland Owner Pilot",
  ownerLabel: "Synthetic owner scenario",
  marketId: "cleveland-oh",
  assets: [
    {
      slug: "acadian-apartments",
      name: "The Acadian Apartments",
      assetType: "multifamily",
      suppliedAddress: "21480 Sheldon Rd",
      canonicalAddress: "21480 Sheldon Rd",
      city: "Brook Park",
      state: "OH",
      postalCode: "44142",
      dwellsyCommunityId: "2195662",
      matchStatus: "matched",
      matchConfidence: 0.98,
      readinessStatus: "monitoring",
      uruStatus: "unknown",
      compSetStatus: "review",
      observedOperatorName: "950 Management",
      sourceNote: "Matched to Dwellsy community 2195662. Operator relationship is observed, not contract verified.",
      buildings: singleBuilding("21480 Sheldon Rd", "Brook Park", "44142", "2195662"),
      tasks: standardTasks(),
    },
    {
      slug: "398-w-bagley-rd",
      name: "398 W. Bagley Rd",
      assetType: "multifamily",
      suppliedAddress: "398 W Bagley Rd",
      canonicalAddress: "398 W Bagley Rd",
      city: "Berea",
      state: "OH",
      postalCode: "44017",
      dwellsyCommunityId: "159122",
      matchStatus: "needs_review",
      matchConfidence: 0.76,
      readinessStatus: "needs_confirmation",
      uruStatus: "unknown",
      compSetStatus: "not_started",
      observedOperatorName: "Cle Turnkey Real Estate",
      sourceNote: "Likely Dwellsy community 159122. Source unit labels use Suite formatting, so attributes need review.",
      buildings: singleBuilding("398 W Bagley Rd", "Berea", "44017", "159122"),
      tasks: standardTasks(true),
    },
    {
      slug: "2515-kemper-rd",
      name: "2515 Kemper Rd",
      assetType: "multifamily",
      suppliedAddress: "2515 Kemper Rd",
      canonicalAddress: "2515 Kemper Rd",
      city: "Shaker Heights",
      state: "OH",
      postalCode: "44120",
      dwellsyCommunityId: "3246948",
      matchStatus: "matched",
      matchConfidence: 0.97,
      readinessStatus: "monitoring",
      uruStatus: "unknown",
      compSetStatus: "review",
      observedOperatorName: "Brick And Mortar Property Management",
      sourceNote: "Recent observations show Brick And Mortar; historical observations show Cleveland Property Management.",
      buildings: singleBuilding("2515 Kemper Rd", "Shaker Heights", "44120", "3246948"),
      tasks: standardTasks(),
    },
    {
      slug: "villas-of-fox-hollow",
      name: "Villas of Fox Hollow",
      assetType: "multifamily",
      suppliedAddress: "4110 Hunters Way",
      canonicalAddress: "88 Fox Hollow Ln",
      city: "Brunswick",
      state: "OH",
      postalCode: "44212",
      dwellsyCommunityId: "505643",
      matchStatus: "matched",
      matchConfidence: 0.93,
      readinessStatus: "needs_confirmation",
      uruStatus: "unknown",
      compSetStatus: "review",
      observedOperatorName: "Harsax Management",
      sourceNote: "The supplied address is retained as an alias; 88 Fox Hollow Ln is the observed public leasing address.",
      buildings: [
        {
          label: "Leasing address",
          suppliedAddress: "4110 Hunters Way",
          canonicalAddress: "88 Fox Hollow Ln",
          city: "Brunswick",
          state: "OH",
          postalCode: "44212",
          dwellsyCommunityId: "505643",
          isPrimary: true,
        },
      ],
      tasks: standardTasks(),
    },
    {
      slug: "greenwood-apartments",
      name: "Greenwood Apartments",
      assetType: "multifamily",
      suppliedAddress: "221 / 251 E 244th St",
      canonicalAddress: "221 E 244th St",
      city: "Euclid",
      state: "OH",
      postalCode: "44123",
      dwellsyCommunityId: "306583",
      matchStatus: "matched",
      matchConfidence: 0.99,
      readinessStatus: "monitoring",
      uruStatus: "unknown",
      compSetStatus: "review",
      observedOperatorName: "GHC Living",
      sourceNote: "Synthetic owner is assumed to own all six Greenwood buildings in Dwellsy community 306583.",
      buildings: [221, 231, 251, 261, 271, 281].map((number, index) => ({
        label: `Building ${number}`,
        suppliedAddress: `${number} E 244th St`,
        canonicalAddress: `${number} E 244th St`,
        city: "Euclid",
        state: "OH",
        postalCode: "44123",
        dwellsyCommunityId: "306583",
        isPrimary: index === 0,
      })),
      tasks: standardTasks(),
    },
    ...[
      ["1371-s-belvoir-blvd", "1371 S Belvoir Blvd", "South Euclid", "44121", "3 bd · 2 ba · 1,600 sf"],
      ["1401-e-61st-st", "1401 E 61st St", "Cleveland", "44103", "4 bd · 1 ba · 1,050 sf"],
      ["3630-bainbridge-rd", "3630 Bainbridge Rd", "Cleveland Heights", "44118", "4 bd · 2 ba · 1,708 sf"],
      ["1803-e-298th-st", "1803 E 298th St", "Wickliffe", "44092", "3 bd · 2 ba · 1,190 sf"],
    ].map(([slug, address, city, postalCode, details]) => ({
      slug,
      name: address,
      assetType: "single_family" as const,
      suppliedAddress: address,
      canonicalAddress: address,
      city,
      state: "OH",
      postalCode,
      matchStatus: "needs_review" as const,
      matchConfidence: 0.82,
      readinessStatus: "needs_confirmation" as const,
      uruStatus: "unknown" as const,
      compSetStatus: "not_started" as const,
      observedOperatorName: "Overland Properties",
      sourceNote: `Current Dwellsy listing observation; ${details}. Ownership is synthetic and requires confirmation.`,
      buildings: singleBuilding(address, city, postalCode),
      tasks: standardTasks(true),
    })),
  ],
};
