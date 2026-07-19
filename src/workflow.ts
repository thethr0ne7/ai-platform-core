export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export type WorkflowFailurePolicy = "fail-fast" | "continue-independent";

export interface WorkflowStep<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly dependsOn?: ReadonlyArray<string>;
  run(context: TContext): Promise<unknown>;
}

export interface WorkflowDefinition<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly steps: ReadonlyArray<WorkflowStep<TContext>>;
}

export interface WorkflowExecutionOptions {
  readonly concurrency?: number;
  readonly failurePolicy?: WorkflowFailurePolicy;
}

export interface WorkflowStepResult {
  readonly id: string;
  readonly status: WorkflowStepStatus;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly output?: unknown;
  readonly error?: string;
}

export interface WorkflowExecutionResult {
  readonly workflowId: string;
  readonly status: "succeeded" | "failed";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly order: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<WorkflowStepResult>;
}

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new WorkflowValidationError(`${label} is required`);
  return normalized;
}

export function topologicalOrder<TContext extends Record<string, unknown>>(
  definition: WorkflowDefinition<TContext>
): ReadonlyArray<string> {
  const stepMap = new Map<string, WorkflowStep<TContext>>();
  const indegree = new Map<string, number>();
  const dependants = new Map<string, string[]>();

  for (const step of definition.steps) {
    const id = normalizeId(step.id, "Workflow step id");
    if (stepMap.has(id)) throw new WorkflowValidationError(`Duplicate workflow step id: ${id}`);
    stepMap.set(id, step);
    indegree.set(id, 0);
    dependants.set(id, []);
  }

  for (const [id, step] of stepMap) {
    const dependencies = [...new Set(step.dependsOn ?? [])].map((dependency) =>
      normalizeId(dependency, `Dependency of ${id}`)
    );
    if (dependencies.includes(id)) {
      throw new WorkflowValidationError(`Workflow step cannot depend on itself: ${id}`);
    }
    for (const dependency of dependencies) {
      if (!stepMap.has(dependency)) {
        throw new WorkflowValidationError(`Unknown dependency for ${id}: ${dependency}`);
      }
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      dependants.get(dependency)?.push(id);
    }
  }

  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    order.push(current);
    for (const dependant of (dependants.get(current) ?? []).sort()) {
      const next = (indegree.get(dependant) ?? 0) - 1;
      indegree.set(dependant, next);
      if (next === 0) {
        ready.push(dependant);
        ready.sort();
      }
    }
  }

  if (order.length !== stepMap.size) {
    throw new WorkflowValidationError("Workflow contains a dependency cycle");
  }

  return order;
}

function skipped(id: string, reason: string): WorkflowStepResult {
  return { id, status: "skipped", error: reason };
}

export async function executeWorkflow<TContext extends Record<string, unknown>>(
  definition: WorkflowDefinition<TContext>,
  context: TContext,
  options: WorkflowExecutionOptions = {}
): Promise<WorkflowExecutionResult> {
  const workflowId = normalizeId(definition.id, "Workflow id");
  const order = topologicalOrder(definition);
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new WorkflowValidationError("Workflow concurrency must be an integer between 1 and 64");
  }
  const failurePolicy = options.failurePolicy ?? "fail-fast";
  const stepMap = new Map(definition.steps.map((step) => [step.id.trim(), step]));
  const results = new Map<string, WorkflowStepResult>();
  const pending = new Set(order);
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  let failureSeen = false;

  while (pending.size > 0) {
    const ready: string[] = [];

    for (const id of order) {
      if (!pending.has(id)) continue;
      const step = stepMap.get(id);
      if (!step) continue;
      const dependencies = step.dependsOn ?? [];
      const dependencyResults = dependencies.map((dependency) => results.get(dependency));
      const failedDependency = dependencyResults.some(
        (result) => result?.status === "failed" || result?.status === "skipped"
      );
      if (failedDependency) {
        results.set(id, skipped(id, "Blocked by failed dependency"));
        pending.delete(id);
        continue;
      }
      if (dependencies.every((dependency) => results.get(dependency)?.status === "succeeded")) {
        ready.push(id);
      }
    }

    if (failurePolicy === "fail-fast" && failureSeen) {
      for (const id of pending) results.set(id, skipped(id, "Skipped after workflow failure"));
      pending.clear();
      break;
    }

    if (ready.length === 0) {
      if (pending.size > 0) {
        for (const id of pending) results.set(id, skipped(id, "No executable dependency path"));
        pending.clear();
      }
      break;
    }

    const batch = ready.slice(0, concurrency);
    for (const id of batch) pending.delete(id);

    const batchResults = await Promise.all(
      batch.map(async (id): Promise<WorkflowStepResult> => {
        const step = stepMap.get(id);
        if (!step) return skipped(id, "Workflow step missing at runtime");
        const stepStartedMs = Date.now();
        const stepStartedAt = new Date(stepStartedMs).toISOString();
        try {
          const output = await step.run(context);
          const completedMs = Date.now();
          return {
            id,
            status: "succeeded",
            startedAt: stepStartedAt,
            completedAt: new Date(completedMs).toISOString(),
            durationMs: completedMs - stepStartedMs,
            output
          };
        } catch (error) {
          const completedMs = Date.now();
          return {
            id,
            status: "failed",
            startedAt: stepStartedAt,
            completedAt: new Date(completedMs).toISOString(),
            durationMs: completedMs - stepStartedMs,
            error: error instanceof Error ? error.message : "Workflow step failed"
          };
        }
      })
    );

    for (const result of batchResults) {
      results.set(result.id, result);
      if (result.status === "failed") failureSeen = true;
    }
  }

  const completedAtMs = Date.now();
  const orderedResults = order.map((id) => results.get(id) ?? skipped(id, "Missing result"));
  return {
    workflowId,
    status: orderedResults.some((result) => result.status === "failed") ? "failed" : "succeeded",
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    order,
    steps: orderedResults
  };
}
