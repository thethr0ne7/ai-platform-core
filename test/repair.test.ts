import assert from "node:assert/strict";
import test from "node:test";
import {
  RepairConfigurationError,
  runRepairLoop,
  type RepairRule
} from "../src/repair.js";

interface CounterState {
  value: number;
}

const incrementRule: RepairRule<CounterState> = {
  id: "increment",
  async apply(state) {
    if (state.value >= 3) return { state, changed: false };
    return {
      state: { value: state.value + 1 },
      changed: true,
      evidence: `${state.value} -> ${state.value + 1}`
    };
  }
};

const validateThree = async (state: CounterState) => ({
  valid: state.value === 3,
  issues: state.value === 3 ? [] : ["value must equal 3"]
});

const fingerprint = (state: CounterState) => JSON.stringify(state);

test("stops immediately when initial state is valid", async () => {
  const outcome = await runRepairLoop(
    { value: 3 },
    { rules: [incrementRule], validate: validateThree, fingerprint }
  );

  assert.equal(outcome.stopReason, "valid");
  assert.equal(outcome.passes, 0);
  assert.deepEqual(outcome.history, []);
});

test("repairs, validates after each changed pass, and stops when valid", async () => {
  let validations = 0;
  const outcome = await runRepairLoop(
    { value: 0 },
    {
      rules: [incrementRule],
      validate: async (state) => {
        validations += 1;
        return validateThree(state);
      },
      fingerprint,
      maxPasses: 5
    }
  );

  assert.equal(outcome.stopReason, "valid");
  assert.equal(outcome.passes, 3);
  assert.equal(outcome.state.value, 3);
  assert.equal(validations, 4);
  assert.deepEqual(outcome.history.map((record) => record.changed), [true, true, true]);
});

test("stops as stable when a pass makes no changes", async () => {
  const outcome = await runRepairLoop(
    { value: 0 },
    {
      rules: [{ id: "noop", async apply(state) { return { state, changed: false }; } }],
      validate: validateThree,
      fingerprint
    }
  );

  assert.equal(outcome.stopReason, "stable");
  assert.equal(outcome.passes, 1);
  assert.equal(outcome.valid, false);
});

test("detects a repeated-state repair cycle", async () => {
  const outcome = await runRepairLoop(
    { value: 0 },
    {
      rules: [
        {
          id: "toggle",
          async apply(state) {
            return { state: { value: state.value === 0 ? 1 : 0 }, changed: true };
          }
        }
      ],
      validate: async () => ({ valid: false, issues: ["never valid"] }),
      fingerprint,
      maxPasses: 10
    }
  );

  assert.equal(outcome.stopReason, "cycle-detected");
  assert.equal(outcome.passes, 2);
});

test("enforces maximum passes", async () => {
  const outcome = await runRepairLoop(
    { value: 0 },
    {
      rules: [
        {
          id: "increment-forever",
          async apply(state) {
            return { state: { value: state.value + 1 }, changed: true };
          }
        }
      ],
      validate: async () => ({ valid: false, issues: ["not finished"] }),
      fingerprint,
      maxPasses: 2
    }
  );

  assert.equal(outcome.stopReason, "max-passes");
  assert.equal(outcome.passes, 2);
});

test("captures deterministic repair failures", async () => {
  const outcome = await runRepairLoop(
    { value: 0 },
    {
      rules: [
        {
          id: "broken",
          async apply() {
            throw new Error("patch failed");
          }
        }
      ],
      validate: validateThree,
      fingerprint
    }
  );

  assert.equal(outcome.stopReason, "repair-failed");
  assert.equal(outcome.error, "patch failed");
});

test("rejects unsafe maxPasses values", async () => {
  await assert.rejects(
    runRepairLoop(
      { value: 0 },
      { rules: [], validate: validateThree, fingerprint, maxPasses: 0 }
    ),
    RepairConfigurationError
  );
});
