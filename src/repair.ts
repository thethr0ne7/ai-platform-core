export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export interface RepairContext {
  pass: number;
  maxPasses: number;
}

export interface RepairResult<TState> {
  state: TState;
  changed: boolean;
  evidence?: string;
}

export interface RepairRule<TState> {
  readonly id: string;
  apply(state: TState, context: RepairContext): Promise<RepairResult<TState>>;
}

export type RepairStopReason =
  | "valid"
  | "stable"
  | "max-passes"
  | "cycle-detected"
  | "repair-failed";

export interface RepairPassRecord {
  pass: number;
  changed: boolean;
  fingerprint: string;
  valid: boolean;
  issues: string[];
  appliedRules: string[];
  evidence: string[];
}

export interface RepairLoopOutcome<TState> {
  state: TState;
  valid: boolean;
  stopReason: RepairStopReason;
  passes: number;
  issues: string[];
  history: RepairPassRecord[];
  error?: string;
}

export interface RepairLoopOptions<TState> {
  rules: ReadonlyArray<RepairRule<TState>>;
  validate(state: TState): Promise<ValidationResult>;
  fingerprint(state: TState): string;
  maxPasses?: number;
}

export class RepairConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepairConfigurationError";
  }
}

export async function runRepairLoop<TState>(
  initialState: TState,
  options: RepairLoopOptions<TState>
): Promise<RepairLoopOutcome<TState>> {
  const maxPasses = options.maxPasses ?? 5;
  if (!Number.isInteger(maxPasses) || maxPasses < 1 || maxPasses > 100) {
    throw new RepairConfigurationError("maxPasses must be an integer from 1 to 100");
  }

  let state = initialState;
  let validation = await options.validate(state);
  const history: RepairPassRecord[] = [];
  const seen = new Set<string>([options.fingerprint(state)]);

  if (validation.valid) {
    return {
      state,
      valid: true,
      stopReason: "valid",
      passes: 0,
      issues: [],
      history
    };
  }

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    let changed = false;
    const appliedRules: string[] = [];
    const evidence: string[] = [];

    try {
      for (const rule of options.rules) {
        const result = await rule.apply(state, { pass, maxPasses });
        state = result.state;
        if (result.changed) {
          changed = true;
          appliedRules.push(rule.id);
          if (result.evidence) evidence.push(result.evidence);
        }
      }
    } catch (error) {
      return {
        state,
        valid: false,
        stopReason: "repair-failed",
        passes: pass,
        issues: validation.issues,
        history,
        error: error instanceof Error ? error.message : "Repair rule failed"
      };
    }

    if (!changed) {
      const fingerprint = options.fingerprint(state);
      history.push({
        pass,
        changed: false,
        fingerprint,
        valid: validation.valid,
        issues: [...validation.issues],
        appliedRules,
        evidence
      });
      return {
        state,
        valid: validation.valid,
        stopReason: "stable",
        passes: pass,
        issues: [...validation.issues],
        history
      };
    }

    validation = await options.validate(state);
    const fingerprint = options.fingerprint(state);
    history.push({
      pass,
      changed: true,
      fingerprint,
      valid: validation.valid,
      issues: [...validation.issues],
      appliedRules,
      evidence
    });

    if (validation.valid) {
      return {
        state,
        valid: true,
        stopReason: "valid",
        passes: pass,
        issues: [],
        history
      };
    }

    if (seen.has(fingerprint)) {
      return {
        state,
        valid: false,
        stopReason: "cycle-detected",
        passes: pass,
        issues: [...validation.issues],
        history
      };
    }
    seen.add(fingerprint);
  }

  return {
    state,
    valid: validation.valid,
    stopReason: "max-passes",
    passes: maxPasses,
    issues: [...validation.issues],
    history
  };
}
