export type ScaleDecision = "approve" | "revise" | "reject";
export type TaskRecommendation = "keep" | "merge" | "stop";

export interface PlannedTask {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly artifact: string;
  readonly evidenceSources: readonly string[];
  readonly riskBoundary?: string;
  readonly dependencies?: readonly string[];
  readonly parallelGroup?: string;
}

export interface ScaleThinkingPlan {
  readonly goal: string;
  readonly systemModel: string;
  readonly leveragePoints: readonly string[];
  readonly tasks: readonly PlannedTask[];
  readonly maxParallelTasks?: number;
}

export interface TaskAssessment {
  readonly taskId: string;
  readonly recommendation: TaskRecommendation;
  readonly reasons: readonly string[];
}

export interface ScaleThinkingAssessment {
  readonly decision: ScaleDecision;
  readonly score: number;
  readonly dimensions: {
    readonly leverage: number;
    readonly depth: number;
    readonly coverage: number;
    readonly riskControl: number;
    readonly taskEconomy: number;
  };
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly taskAssessments: readonly TaskAssessment[];
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/u).filter((token) => token.length > 2));
}

function similarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / new Set([...leftTokens, ...rightTokens]).size;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(20, Math.round(value)));
}

function uniqueNonEmpty(values: readonly string[]): number {
  return new Set(values.map(normalize).filter(Boolean)).size;
}

function detectRedundancy(tasks: readonly PlannedTask[]): Map<string, string[]> {
  const redundant = new Map<string, string[]>();
  for (let leftIndex = 0; leftIndex < tasks.length; leftIndex += 1) {
    const left = tasks[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < tasks.length; rightIndex += 1) {
      const right = tasks[rightIndex];
      if (!right) continue;
      const objectiveSimilarity = similarity(left.objective, right.objective);
      const artifactSimilarity = similarity(left.artifact, right.artifact);
      if (objectiveSimilarity >= 0.72 && artifactSimilarity >= 0.6) {
        redundant.set(left.id, [...(redundant.get(left.id) ?? []), right.id]);
        redundant.set(right.id, [...(redundant.get(right.id) ?? []), left.id]);
      }
    }
  }
  return redundant;
}

export function evaluateScaleThinkingPlan(plan: ScaleThinkingPlan): ScaleThinkingAssessment {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!plan.goal.trim()) blockers.push("Goal is required");
  if (plan.systemModel.trim().length < 40) blockers.push("System model is too shallow");
  if (plan.leveragePoints.length === 0) blockers.push("At least one leverage point is required");
  if (plan.tasks.length === 0) blockers.push("At least one task is required");

  const taskIds = new Set<string>();
  for (const task of plan.tasks) {
    if (taskIds.has(task.id)) blockers.push(`Duplicate task id: ${task.id}`);
    taskIds.add(task.id);
    if (!task.artifact.trim()) blockers.push(`Task ${task.id} has no independently verifiable artifact`);
    if (task.evidenceSources.length === 0 && !task.riskBoundary) {
      warnings.push(`Task ${task.id} adds neither evidence coverage nor an explicit risk boundary`);
    }
  }

  const redundant = detectRedundancy(plan.tasks);
  const maxParallel = plan.maxParallelTasks ?? 3;
  const parallelCounts = new Map<string, number>();
  for (const task of plan.tasks) {
    if (!task.parallelGroup) continue;
    parallelCounts.set(task.parallelGroup, (parallelCounts.get(task.parallelGroup) ?? 0) + 1);
  }
  for (const [group, count] of parallelCounts) {
    if (count > maxParallel) blockers.push(`Parallel group ${group} has ${count} tasks, above limit ${maxParallel}`);
  }

  const taskAssessments: TaskAssessment[] = plan.tasks.map((task) => {
    const reasons: string[] = [];
    const duplicates = redundant.get(task.id) ?? [];
    if (duplicates.length > 0) reasons.push(`Near-duplicate objective and artifact with: ${duplicates.join(", ")}`);
    if (task.evidenceSources.length === 0) reasons.push("No independent evidence source");
    if (!task.riskBoundary && task.evidenceSources.length === 0) reasons.push("No separate risk boundary");
    if (!task.artifact.trim()) reasons.push("No verifiable artifact");

    let recommendation: TaskRecommendation = "keep";
    if (!task.artifact.trim()) recommendation = "stop";
    else if (duplicates.length > 0) recommendation = "merge";
    else if (task.evidenceSources.length === 0 && !task.riskBoundary) recommendation = "merge";

    return { taskId: task.id, recommendation, reasons };
  });

  const distinctArtifacts = uniqueNonEmpty(plan.tasks.map((task) => task.artifact));
  const distinctEvidence = uniqueNonEmpty(plan.tasks.flatMap((task) => task.evidenceSources));
  const distinctRisks = uniqueNonEmpty(plan.tasks.map((task) => task.riskBoundary ?? ""));
  const redundantCount = taskAssessments.filter((assessment) => assessment.recommendation === "merge").length;
  const stoppedCount = taskAssessments.filter((assessment) => assessment.recommendation === "stop").length;

  const leverage = clamp(plan.leveragePoints.length * 5 + distinctArtifacts * 2);
  const depth = clamp((plan.systemModel.trim().length >= 120 ? 12 : 6) + distinctRisks * 3);
  const coverage = clamp(distinctEvidence * 4 + Math.min(8, distinctArtifacts * 2));
  const riskControl = clamp(distinctRisks * 5 + plan.tasks.filter((task) => (task.dependencies?.length ?? 0) > 0).length * 2);
  const taskEconomy = clamp(20 - redundantCount * 4 - stoppedCount * 6 - Math.max(0, plan.tasks.length - distinctArtifacts) * 2);
  const score = leverage + depth + coverage + riskControl + taskEconomy;

  if (redundantCount >= Math.max(3, Math.ceil(plan.tasks.length / 2))) {
    blockers.push("Task inflation detected: at least half of the plan should be merged");
  }
  if (plan.tasks.length > 8 && distinctArtifacts / plan.tasks.length < 0.7) {
    blockers.push("The plan multiplies tasks faster than independently verifiable artifacts");
  }

  const decision: ScaleDecision = blockers.length > 0 ? "reject" : score >= 70 ? "approve" : "revise";
  return {
    decision,
    score,
    dimensions: { leverage, depth, coverage, riskControl, taskEconomy },
    blockers,
    warnings,
    taskAssessments
  };
}
