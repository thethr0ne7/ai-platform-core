export type IntelligenceLensId =
  | "strategic"
  | "territorial"
  | "economic"
  | "financial"
  | "legal"
  | "support"
  | "production"
  | "logistics"
  | "market"
  | "client"
  | "evidence"
  | "document"
  | "risk"
  | "forecast";

export type ClaimLevel = "fact" | "interpretation" | "hypothesis";
export type DecisionSeverity = "info" | "opportunity" | "warning" | "blocker";

export interface IntelligenceEvidence {
  readonly id: string;
  readonly sourceType: "official-document" | "market-document" | "project-document" | "calculation";
  readonly sourceRef: string;
  readonly quote?: string;
  readonly verified: boolean;
}

export interface IntelligenceClaim {
  readonly id: string;
  readonly lens: IntelligenceLensId;
  readonly level: ClaimLevel;
  readonly statement: string;
  readonly evidenceIds: readonly string[];
  readonly confidence: number;
  readonly falsificationCriteria: readonly string[];
  readonly tags?: readonly string[];
}

export interface IntelligenceLensDefinition {
  readonly id: IntelligenceLensId;
  readonly title: string;
  readonly purpose: string;
  readonly critical: boolean;
  readonly dependsOn: readonly IntelligenceLensId[];
}

export interface IntelligenceDecisionItem {
  readonly lens: IntelligenceLensId;
  readonly severity: DecisionSeverity;
  readonly statement: string;
  readonly claimIds: readonly string[];
}

export interface IntelligenceProjectContext {
  readonly projectId: string;
  readonly projectName: string;
  readonly claims: readonly IntelligenceClaim[];
  readonly evidence: readonly IntelligenceEvidence[];
  readonly minimumCriticalCoverage?: number;
}

export interface LensAssessment {
  readonly lens: IntelligenceLensId;
  readonly coverage: number;
  readonly verifiedFactCount: number;
  readonly interpretationCount: number;
  readonly hypothesisCount: number;
  readonly unsupportedClaimIds: readonly string[];
  readonly status: "ready" | "partial" | "missing";
}

export interface IntelligenceDecisionBrief {
  readonly projectId: string;
  readonly projectName: string;
  readonly lensAssessments: readonly LensAssessment[];
  readonly blockers: readonly IntelligenceDecisionItem[];
  readonly opportunities: readonly IntelligenceDecisionItem[];
  readonly warnings: readonly IntelligenceDecisionItem[];
  readonly nextActions: readonly string[];
  readonly evidenceCoverage: number;
  readonly criticalCoverage: number;
  readonly decisionStatus: "ready-for-decision" | "needs-evidence" | "blocked";
}

export const INTELLIGENCE_LENSES: readonly IntelligenceLensDefinition[] = [
  { id: "strategic", title: "Strategic Intelligence", purpose: "Connect long-term policy, sector and project direction.", critical: false, dependsOn: ["forecast", "support"] },
  { id: "territorial", title: "Territorial Intelligence", purpose: "Compare regions, clusters, infrastructure and spatial concentration.", critical: false, dependsOn: ["market", "logistics"] },
  { id: "economic", title: "Economic Intelligence", purpose: "Test unit economics, demand density and value creation.", critical: true, dependsOn: ["market", "production", "logistics"] },
  { id: "financial", title: "Financial Intelligence", purpose: "Test CAPEX, OPEX, cash flow, financing and cofinancing.", critical: true, dependsOn: ["economic", "support"] },
  { id: "legal", title: "Legal Intelligence", purpose: "Identify applicant form, legal conditions, prohibitions and obligations.", critical: true, dependsOn: ["document", "evidence"] },
  { id: "support", title: "Support Intelligence", purpose: "Trace project needs to grants, subsidies, loans, leasing and land measures.", critical: true, dependsOn: ["legal", "document", "evidence"] },
  { id: "production", title: "Production Intelligence", purpose: "Model assets, operations, capacity, seasonality and bottlenecks.", critical: false, dependsOn: ["market"] },
  { id: "logistics", title: "Logistics Intelligence", purpose: "Measure travel, routing, storage, downtime and cluster efficiency.", critical: false, dependsOn: ["territorial", "production"] },
  { id: "market", title: "Market Intelligence", purpose: "Verify customers, demand, competitors, pricing and repeatability.", critical: true, dependsOn: ["client", "evidence"] },
  { id: "client", title: "Client Intelligence", purpose: "Track interest, letters of intent, contracts and demand volume.", critical: false, dependsOn: ["evidence"] },
  { id: "evidence", title: "Evidence Intelligence", purpose: "Separate verified facts from interpretations and hypotheses.", critical: true, dependsOn: [] },
  { id: "document", title: "Document Intelligence", purpose: "Track official document identity, version, dates, conditions and exact citations.", critical: true, dependsOn: ["evidence"] },
  { id: "risk", title: "Risk Intelligence", purpose: "Expose failure modes, mitigations, kill criteria and residual uncertainty.", critical: true, dependsOn: ["financial", "legal", "market", "production"] },
  { id: "forecast", title: "Forecast Intelligence", purpose: "Create bounded forecasts with confidence and falsification criteria.", critical: false, dependsOn: ["strategic", "evidence"] }
];

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validateClaim(claim: IntelligenceClaim, evidenceById: ReadonlyMap<string, IntelligenceEvidence>): void {
  if (!claim.id.trim()) throw new Error("Claim id is required");
  if (!claim.statement.trim()) throw new Error(`Claim ${claim.id} statement is required`);
  if (claim.confidence < 0 || claim.confidence > 1) throw new Error(`Claim ${claim.id} confidence must be between 0 and 1`);
  if (claim.level === "fact" && claim.evidenceIds.length === 0) throw new Error(`Fact ${claim.id} requires evidence`);
  if (claim.level !== "fact" && claim.falsificationCriteria.length === 0) {
    throw new Error(`${claim.level} ${claim.id} requires falsification criteria`);
  }
  for (const evidenceId of claim.evidenceIds) {
    if (!evidenceById.has(evidenceId)) throw new Error(`Claim ${claim.id} references unknown evidence ${evidenceId}`);
  }
}

function claimIsSupported(claim: IntelligenceClaim, evidenceById: ReadonlyMap<string, IntelligenceEvidence>): boolean {
  if (claim.level !== "fact") return claim.evidenceIds.length > 0;
  return claim.evidenceIds.length > 0 && claim.evidenceIds.every((id) => evidenceById.get(id)?.verified === true);
}

function assessLens(
  lens: IntelligenceLensDefinition,
  claims: readonly IntelligenceClaim[],
  evidenceById: ReadonlyMap<string, IntelligenceEvidence>
): LensAssessment {
  const lensClaims = claims.filter((claim) => claim.lens === lens.id);
  const supported = lensClaims.filter((claim) => claimIsSupported(claim, evidenceById));
  const unsupported = lensClaims.filter((claim) => !claimIsSupported(claim, evidenceById));
  const facts = lensClaims.filter((claim) => claim.level === "fact");
  const verifiedFacts = facts.filter((claim) => claimIsSupported(claim, evidenceById));
  const coverage = lensClaims.length === 0 ? 0 : clamp(supported.length / lensClaims.length);
  const status = lensClaims.length === 0 ? "missing" : coverage === 1 ? "ready" : "partial";
  return {
    lens: lens.id,
    coverage,
    verifiedFactCount: verifiedFacts.length,
    interpretationCount: lensClaims.filter((claim) => claim.level === "interpretation").length,
    hypothesisCount: lensClaims.filter((claim) => claim.level === "hypothesis").length,
    unsupportedClaimIds: unsupported.map((claim) => claim.id),
    status
  };
}

function claimsWithTag(claims: readonly IntelligenceClaim[], tag: string): readonly IntelligenceClaim[] {
  return claims.filter((claim) => claim.tags?.includes(tag));
}

function decisionItem(
  lens: IntelligenceLensId,
  severity: DecisionSeverity,
  statement: string,
  claims: readonly IntelligenceClaim[]
): IntelligenceDecisionItem {
  return { lens, severity, statement, claimIds: claims.map((claim) => claim.id) };
}

export function buildIntelligenceDecisionBrief(context: IntelligenceProjectContext): IntelligenceDecisionBrief {
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  const duplicateEvidence = context.evidence.length !== evidenceById.size;
  if (duplicateEvidence) throw new Error("Evidence ids must be unique");
  for (const claim of context.claims) validateClaim(claim, evidenceById);

  const lensAssessments = INTELLIGENCE_LENSES.map((lens) => assessLens(lens, context.claims, evidenceById));
  const assessmentByLens = new Map(lensAssessments.map((assessment) => [assessment.lens, assessment]));
  const critical = INTELLIGENCE_LENSES.filter((lens) => lens.critical);
  const criticalCoverage = critical.reduce((sum, lens) => sum + (assessmentByLens.get(lens.id)?.coverage ?? 0), 0) / critical.length;
  const evidenceCoverage = context.claims.length === 0
    ? 0
    : context.claims.filter((claim) => claimIsSupported(claim, evidenceById)).length / context.claims.length;

  const blockers: IntelligenceDecisionItem[] = [];
  const warnings: IntelligenceDecisionItem[] = [];
  const opportunities: IntelligenceDecisionItem[] = [];
  const nextActions = new Set<string>();
  const minimumCriticalCoverage = context.minimumCriticalCoverage ?? 0.75;

  for (const lens of critical) {
    const assessment = assessmentByLens.get(lens.id);
    if (!assessment || assessment.status === "missing") {
      blockers.push(decisionItem(lens.id, "blocker", `${lens.title} has no decision-grade claims.`, []));
      nextActions.add(`Collect verified inputs for ${lens.title}.`);
    } else if (assessment.coverage < minimumCriticalCoverage) {
      warnings.push(decisionItem(lens.id, "warning", `${lens.title} contains unsupported or incomplete claims.`, context.claims.filter((claim) => assessment.unsupportedClaimIds.includes(claim.id))));
      nextActions.add(`Resolve unsupported claims in ${lens.title}.`);
    }
  }

  const opportunityRules: ReadonlyArray<readonly [IntelligenceLensId, string, string]> = [
    ["territorial", "high-priority-cluster", "A high-priority operating cluster has been identified."],
    ["production", "repeatable-operation", "Repeatable operations can increase annual asset utilization."],
    ["client", "demand-proof", "Demand evidence can strengthen grant, leasing and credit applications."],
    ["support", "support-match", "A support instrument appears aligned with the project structure."]
  ];
  for (const [lens, tag, statement] of opportunityRules) {
    const matched = claimsWithTag(context.claims, tag).filter((claim) => claimIsSupported(claim, evidenceById));
    if (matched.length > 0) opportunities.push(decisionItem(lens, "opportunity", statement, matched));
  }

  const riskClaims = context.claims.filter((claim) => claim.lens === "risk" && claimIsSupported(claim, evidenceById));
  for (const claim of riskClaims) warnings.push(decisionItem("risk", "warning", claim.statement, [claim]));

  if (claimsWithTag(context.claims, "needs-client-interviews").length > 0) nextActions.add("Conduct 10–15 structured customer interviews in the top two clusters.");
  if (claimsWithTag(context.claims, "needs-letters-of-intent").length > 0) nextActions.add("Collect 5–10 letters of intent with hectares, operations and season windows.");
  if (claimsWithTag(context.claims, "needs-official-rules").length > 0) nextActions.add("Verify the current regional competition rules, applicant form and eligible cost list.");
  if (claimsWithTag(context.claims, "needs-financial-model").length > 0) nextActions.add("Validate CAPEX, OPEX, logistics and cash-flow assumptions against supplier quotes and operating scenarios.");

  const decisionStatus = blockers.length > 0
    ? "blocked"
    : criticalCoverage < minimumCriticalCoverage || evidenceCoverage < minimumCriticalCoverage
      ? "needs-evidence"
      : "ready-for-decision";

  return {
    projectId: context.projectId,
    projectName: context.projectName,
    lensAssessments,
    blockers,
    opportunities,
    warnings,
    nextActions: [...nextActions],
    evidenceCoverage,
    criticalCoverage,
    decisionStatus
  };
}
