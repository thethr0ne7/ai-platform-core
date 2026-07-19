# Product Adapter and Bounded Repair Loop v0.6

## Product adapter boundary

A product adapter converts a product-facing input into a stable `PlatformRequest`, then converts the platform result back into the product-facing output.

`PRODUCT INPUT → ADAPTER → PLATFORM REQUEST → ORCHESTRATOR → PLATFORM RESULT → ADAPTER → PRODUCT OUTPUT`

The shared core may contain adapter contracts and minimal integration examples. It must not absorb product datasets, user interfaces, scraping logic, scoring models, or business-specific persistence.

The PROIDU adapter in this phase is intentionally a transport proof. It validates a small admissions-query envelope and executes it through the existing `system.echo` action. It does not calculate admission chances and does not contain university data.

## Repair-loop method

The repair engine follows the same optimization principle as bubble sort with a `swapped` flag: if a complete pass changes nothing, further passes cannot improve the current state under the active rule set, so execution stops.

`INPUT → VALIDATE → REPAIR PASS → CHANGED?`

- no change: stop with `stable`;
- changed and valid: stop with `valid`;
- changed but fingerprint already seen: stop with `cycle-detected`;
- changed and still invalid: continue, up to `maxPasses`;
- thrown repair error: stop with `repair-failed`.

## Safety properties

- bounded to 1–100 passes;
- validation runs initially and after every changed pass;
- state fingerprints detect oscillation;
- each pass records rules, evidence, issues, validity, and fingerprint;
- the engine does not read or write Git repositories;
- the engine does not choose or generate repair rules;
- repository mutations remain explicit reviewed GitHub operations.

## Intended future use

Concrete callers may provide rules for AST transforms, configuration normalization, generated-code cleanup, migration repair, or deterministic lint fixes. LLM-generated proposals may be introduced later only behind approval, evidence, tests, and repository review gates.
