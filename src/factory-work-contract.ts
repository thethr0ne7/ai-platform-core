export type FactoryStage =
  | "research"
  | "propose"
  | "validate"
  | "approve-commit"
  | "execute"
  | "observe"
  | "save"
  | "ship";

export type FactoryStatus = "pending" | "running" | "passed" | "failed" | "blocked" | "skipped";

export interface FactoryEvidenceRef {
  readonly id: string;
  readonly source: string;
  readonly status: "verified" | "unverified" | "inferred";
}

export interface FactoryCheckpoint {
  readonly stage: FactoryStage;
  readonly status: FactoryStatus;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly summary?: string;
  readonly evidence?: readonly FactoryEvidenceRef[];
  readonly errors?: readonly string[];
}

export interface FactoryWorkContract {
  readonly id: string;
  readonly goal: string;
  readonly product: string;
  readonly mode: "fast" | "working" | "production";
  readonly maxRetries: number;
  readonly requiresApproval: boolean;
  readonly killCriteria: readonly string[];
  readonly checkpoints: readonly FactoryCheckpoint[];
}

const stageOrder: readonly FactoryStage[] = [
  "research",
  "propose",
  "validate",
  "approve-commit",
  "execute",
  "observe",
  "save",
  "ship"
];

function assertIsoDate(value: string | undefined, field: string): void {
  if (value !== undefined && !Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO date`);
}

export function validateFactoryWorkContract(contract: FactoryWorkContract): void {
  if (!contract.id.trim()) throw new Error("Factory work id is required");
  if (!contract.goal.trim()) throw new Error("Factory work goal is required");
  if (!contract.product.trim()) throw new Error("Factory product is required");
  if (!Number.isInteger(contract.maxRetries) || contract.maxRetries < 0 || contract.maxRetries > 5) {
    throw new Error("maxRetries must be an integer between 0 and 5");
  }
  if (contract.killCriteria.length === 0) throw new Error("At least one kill criterion is required");

  const seen = new Set<FactoryStage>();
  let previousIndex = -1;
  for (const checkpoint of contract.checkpoints) {
    if (seen.has(checkpoint.stage)) throw new Error(`Duplicate checkpoint: ${checkpoint.stage}`);
    seen.add(checkpoint.stage);
    const index = stageOrder.indexOf(checkpoint.stage);
    if (index < previousIndex) throw new Error(`Checkpoint ${checkpoint.stage} is out of order`);
    previousIndex = index;
    assertIsoDate(checkpoint.startedAt, `${checkpoint.stage}.startedAt`);
    assertIsoDate(checkpoint.completedAt, `${checkpoint.stage}.completedAt`);
    if (checkpoint.status === "passed" && checkpoint.stage === "research") {
      const verified = checkpoint.evidence?.some((item) => item.status === "verified") ?? false;
      if (!verified) throw new Error("Research cannot pass without verified evidence");
    }
  }
}

function checkpoint(contract: FactoryWorkContract, stage: FactoryStage): FactoryCheckpoint | undefined {
  return contract.checkpoints.find((item) => item.stage === stage);
}

function passed(contract: FactoryWorkContract, stage: FactoryStage): boolean {
  return checkpoint(contract, stage)?.status === "passed";
}

export interface FactoryExecutionDecision {
  readonly allowed: boolean;
  readonly blockers: readonly string[];
}

export function canExecuteFactoryWork(contract: FactoryWorkContract): FactoryExecutionDecision {
  validateFactoryWorkContract(contract);
  const blockers: string[] = [];
  if (!passed(contract, "research")) blockers.push("Research checkpoint has not passed");
  if (!passed(contract, "propose")) blockers.push("Proposal checkpoint has not passed");
  if (!passed(contract, "validate")) blockers.push("Validation checkpoint has not passed");
  if (contract.requiresApproval && !passed(contract, "approve-commit")) {
    blockers.push("Explicit approval/commit checkpoint has not passed");
  }
  return { allowed: blockers.length === 0, blockers };
}

export interface FactoryShipDecision {
  readonly allowed: boolean;
  readonly blockers: readonly string[];
}

export function canShipFactoryWork(contract: FactoryWorkContract): FactoryShipDecision {
  validateFactoryWorkContract(contract);
  const blockers: string[] = [];
  const execution = canExecuteFactoryWork(contract);
  blockers.push(...execution.blockers);
  for (const stage of ["execute", "observe", "save"] as const) {
    if (!passed(contract, stage)) blockers.push(`${stage} checkpoint has not passed`);
  }
  const failed = contract.checkpoints.filter((item) => item.status === "failed");
  if (failed.length > contract.maxRetries) blockers.push("Retry budget exceeded");
  return { allowed: blockers.length === 0, blockers };
}

export function advanceFactoryCheckpoint(
  contract: FactoryWorkContract,
  next: FactoryCheckpoint
): FactoryWorkContract {
  validateFactoryWorkContract(contract);
  if (contract.checkpoints.some((item) => item.stage === next.stage)) {
    throw new Error(`Checkpoint already exists: ${next.stage}`);
  }
  const previous = contract.checkpoints.at(-1);
  const previousIndex = previous ? stageOrder.indexOf(previous.stage) : -1;
  const nextIndex = stageOrder.indexOf(next.stage);
  if (nextIndex !== previousIndex + 1) throw new Error(`Expected next stage ${stageOrder[previousIndex + 1] ?? "none"}`);
  const updated = { ...contract, checkpoints: [...contract.checkpoints, next] };
  validateFactoryWorkContract(updated);
  return updated;
}
