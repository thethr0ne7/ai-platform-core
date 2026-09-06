# Higgsfield Production — Upstream Knowledge Map

Last synthesis: 2026-09-06.

This file records the sources used to build `SKILL.md`. It is a source map, not
a frozen model/pricing catalog. Live Higgsfield contracts, billing and account
state always override snapshots in repositories.

## Official Higgsfield agent skills

Repository: `higgsfield-ai/skills`

Observed repository skill version: `0.12.0`.

Studied skill families and supporting docs:

- `higgsfield-generate/SKILL.md`
- `higgsfield-generate/references/prompt-engineering.md`
- `higgsfield-generate/references/media-inputs.md`
- `higgsfield-generate/references/workflows.md`
- `higgsfield-generate/references/troubleshooting.md`
- `higgsfield-soul-id/SKILL.md`
- `higgsfield-product-photoshoot/SKILL.md`
- `higgsfield-brandkit/SKILL.md`
- `higgsfield-marketplace-cards/SKILL.md`
- `higgsfield-websites/SKILL.md`
- `higgsfield-video-explainer/SKILL.md`
- `higgsfield-youtube-thumbnail/SKILL.md`
- `CLAUDE.md`
- `COOKBOOK.md`

Repository note: the current README/setup material references
`higgsfield-game-generation`, while a direct fetch of that folder's `SKILL.md`
was not present at the inspected revision. Do not fabricate the missing skill;
use the live official catalog/current repo when game generation is requested.

## Higgsfield skills installed in the OpenAI/ChatGPT connector runtime

The following installed skills were inspected as production contracts:

1. `ad-multiplier`
2. `brand-asset-creation`
3. `faceless-video`
4. `narrator`
5. `product-photoshoot`
6. `subtitles`
7. `thumbnail-generation`
8. `ugc-product-video`
9. `ugc-review-video`
10. `ugc-try-on-video`
11. `ugc-tutorial-video`
12. `ugc-unboxing-video`
13. `ugc-website-video`

These runtime skills are more specific than this master skill for their own
narrow deliverables. The master skill adds the user's global budget/spend and
activation gates around them.

## Production orchestration patterns

### `kyle-park-io/higgsfield`

Adopted patterns:

- project-scoped SSOT (`scenes.ts` pattern)
- prompts/keyframes/outputs/references separation
- scene status tracking
- `credit-log.md`
- model/plan reporting
- live cost preflight before MCP generation
- aspect/duration compatibility as model-selection gates
- immutable/timestamped generated outputs
- deterministic text overlays in post instead of trusting moving generative text

### `Hikhakk/higgsfield-mcp-unified`

Adopted reliability concepts:

- `preflight_check`
- typed parameter validation
- model recommendation only after requirements are known
- idempotency
- bounded retries with backoff
- explicit error taxonomy / circuit-breaker thinking

Do **not** adopt its experimental reverse-engineered consumer-web backend as the
normal production path. It is brittle, unsupported and may conflict with terms
or change without notice.

### `QalaLabs/claude-higgsfield-mcp`

Adopted orchestration concepts:

- validate assets before generation
- high-level pipeline thinking (`generate_and_animate` style)
- centralized character/history/usage awareness
- motion/style discovery before submit

The official Higgsfield skills and current connector contracts take priority over
this older/narrower community implementation.

## User-specific hard overrides

These rules intentionally override generic advice that might otherwise submit
immediately:

- Higgsfield is **explicit opt-in only**. Never invoke it merely because it is
  relevant.
- Every paid generation stage gets balance + entitlement + live schema + exact
  cost preflight and an approval/budget gate.
- Website-only `Free` actions are not converted to paid MCP calls silently.
- No expensive batch until a representative proof passes QC.
- One variable per iteration.
- Retry only failed indices.
- Never silently switch models or billing mode.
- No claim of visual QA without actual pixels/video inspection.
- Finished deliverable, not loose generations, is the definition of success.

## Refresh policy

At the beginning of any future Higgsfield production in which the answer depends
on changing platform capabilities:

1. inspect current account/workspace/balance;
2. inspect live model/workflow contract;
3. inspect current cost/entitlement path;
4. route to the installed specialized skill if one owns the deliverable;
5. use repository material only as workflow knowledge, never as proof of current
   access, price, resolution, duration or Unlimited/Free status.
