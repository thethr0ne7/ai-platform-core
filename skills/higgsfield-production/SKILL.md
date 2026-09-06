---
name: higgsfield-production
version: 1.0.0
description: |
  Master production skill for all Higgsfield work. Routes image, video, UGC,
  ads, faceless, narration, subtitles, thumbnails, product photography,
  branding, websites/apps/games, Genjutsu, editing, 3D and utility operations.
  The skill is budget-first, reference-locked, live-contract-driven and
  user-approval-gated. It exists to prevent speculative generation and wasted
  credits while producing finished deliverables rather than loose prompts.
---

# Higgsfield Production — Master Skill

This is the controlling protocol for Higgsfield work. It is intentionally
stricter than generic model documentation because production budget and user
approval are hard constraints.

## 0. Non-negotiable user control

1. **NEVER invoke Higgsfield unless the user explicitly asks to use Higgsfield.**
   Mentioning a project that previously used Higgsfield is not permission.
2. **Never spend credits implicitly.** A paid generation stage requires a cost
   preflight and explicit user approval, unless the user has already granted a
   concrete budget envelope for that exact stage.
3. **Never exceed an approved budget envelope.** Stop before the next submit.
4. **Never silently choose credits vs Unlimited.** If the tool returns
   `unlim_choice`, no job was submitted: present the exact choice and wait.
5. **Never convert a website-only `Free` action into a credit-paid MCP/API call.**
   If the Higgsfield UI shows `Free` but the connected surface cannot consume
   that allowance, say so and prepare the exact manual run instead.
6. **Never infer entitlement from the model catalog.** `supports_unlim=true`
   means the model can support an allowance; it does not prove this account has
   the allowance.
7. Publishing, posting, deploying to a community feed, or any external side
   effect requires explicit approval unless the user already requested it.

## 1. Source-of-truth hierarchy

Resolve conflicts in this order:

1. **Live Higgsfield account state and live model/workflow contract** returned by
   the currently connected surface.
2. **Installed Higgsfield workflow skill** for the requested deliverable.
3. **Official `higgsfield-ai/skills` guidance** and current official CLI/MCP
   contracts.
4. **Project SSOT and approved user assets.**
5. Community workflow patterns such as `kyle-park-io/higgsfield` and reliability
   ideas from `higgsfield-mcp-unified`.
6. Old pricing/model snapshots are advisory only and never override live data.

Always inspect the live schema when aspect, duration, media roles, resolution,
mode, audio, availability or billing matters. Never invent a parameter.

## 2. Production state — one SSOT

Every non-trivial project must have one logical source of truth. Track at least:

```text
project
  brief
  deliverable
  aspect_ratio
  target_duration
  audio_source
  style_lock
  identity_lock
  product_lock
  location_lock
  props
  scenes[]
    id
    purpose
    start_frame
    end_frame
    references[]
    model
    params
    status
    expected_cost
    actual_cost
    job_id
    retry_count
    qa
    approval
  expected_total_cost
  actual_total_cost
  remaining_budget
```

Recommended status progression:

```text
todo -> planned -> reference -> keyframe -> approved -> submitted -> rendered
     -> qa -> repaired -> done
```

Never overwrite a completed asset. Results are immutable; replacements create a
new revision. Preserve stable scene/index numbering throughout retries.

## 3. Mandatory PREPAID gate

Before **every new paid generation stage**, perform all applicable checks:

```text
[ ] Higgsfield was explicitly requested
[ ] current workspace/account resolved
[ ] current credit balance known
[ ] Unlimited/free allowance status known when relevant
[ ] live model/workflow schema loaded
[ ] exact media roles validated
[ ] aspect ratio supported
[ ] duration supported
[ ] resolution/mode/audio parameters supported
[ ] required source/reference assets exist
[ ] exact credit cost estimated when the surface exposes cost preflight
[ ] cost fits remaining user-approved budget
[ ] previous dependency passed QC/approval
[ ] user approved the paid stage or already delegated its exact budget
```

If any box is false, **do not submit**.

For a multi-item stage, calculate both per-item cost and total expected cost. Say
what the balance will approximately become after the stage. Do not submit an
expensive batch merely because each item individually fits.

## 4. Cheap-first, proof-first

Production order for uncertain creative work:

```text
brief -> visual direction -> cheap/free proof -> MASTER -> QC -> approval
      -> one representative motion proof -> QC -> approved scale-out
```

Rules:

- Prefer a free path when it genuinely covers the requested operation.
- For concept iteration, prefer low-cost / low-resolution / still-image proof
  before premium video.
- **Never batch expensive video before one representative sample passes QC.**
- Do not spend premium-model credits to discover the art direction.
- Promote to a more expensive model only after the direction is confirmed or
  when a cheaper model cannot test the relevant property.
- Change **one variable per iteration**: model, reference, motion instruction,
  framing, duration or lighting — not several at once.

## 5. Asset and continuity locks

Paid video starts only after relevant upstream locks exist.

### Style lock
Lock one visual anchor/formula and reuse it. Do not independently reinvent style
per scene.

### Identity lock
Use the same approved identity/reference element/media across dependent scenes.
Never regenerate a character mid-run because one shot failed.

### Product lock
Use the same real product reference and canonical product description. Never
invent unseen product features, labels, price, claims or mechanics.

### Location lock
Use approved locations and coverage views. For multi-scene work, plan variation
in camera coverage rather than asking the model to reinvent the world every cut.

### Reference order
Media order is part of the contract. Preserve the same ordered manifest across
retries. Do not drop references to get around a failed generation.

## 6. Prompt discipline

For ordinary Higgsfield generation:

- Prefer concrete, sensory instructions.
- Include only what the model needs: subject/action, setting, camera, lighting,
  physical motion and style.
- Generic prompts should usually stay concise (roughly under 200 tokens); use a
  longer structured template only when the active specialized skill requires it.
- **Image-to-image:** describe the change; do not redundantly redescribe the
  whole input.
- **Image-to-video:** the start frame already describes appearance. Prompt the
  motion, camera path, timing, action, forces/weight, atmosphere and end state.
- Use positive target phrasing where possible (`tack sharp`, `empty landscape`)
  rather than a giant negative list.
- Never reference a user-supplied style image as identity unless the user asked
  for that identity and has authority to use it.

For cinematic motion use this order when applicable:

```text
REFERENCE / IDENTITY LOCK
WORLD / LOCATION ANCHOR
START FRAME + BLOCKING
ORDERED SHOT OR ACTION STRUCTURE
CAMERA / OPTICS
MOTION / PHYSICS
LIGHTING
AUDIO
CONSTRAINTS
```

Physical motion should be causal:

```text
cause -> force -> movement -> inertia -> damping/end state
```

## 7. Camera and blocking

Specify spatial facts when they matter:

- screen-left / screen-right
- camera distance and height
- subject distance and orientation
- 180-degree axis
- start composition
- path / speed / easing
- end composition

Distinguish dolly, truck, tracking, pan, tilt, pedestal, crane, orbit/arc,
handheld/POV and zoom. Do not use camera vocabulary as decoration.

For multi-shot work, vary shot size and angle intentionally. Do not reopen every
scene with the same establishing wide. OTS requires an actual foreground
character; never use OTS for object-only scenes.

## 8. Batch law and job lifecycle

1. Write all requests for a logical wave before submitting.
2. Use stable indices.
3. Respect the surface's maximum batch/concurrency size.
4. Persist `{index, job_id}` immediately after acceptance.
5. A timeout or pending state is **not** permission to resubmit.
6. Freeze completed indices.
7. Retry only rejected/failed indices.
8. Never retry the full batch because one item failed.
9. A successful retry replaces the failed job at the same stable index.
10. Bounded retries only. Repeated comparable failures require diagnosis, not
    credit-burning repetition.

Default repair policy for paid creative generation:

```text
attempt 1 -> inspect failure
attempt 2 -> same dependency set, focused correction
still bad -> stop or materially change the plan with user visibility
```

Specialized installed skills may define a tighter/different bounded ladder; obey
that workflow, but never create an unbounded loop.

## 9. QC gate

A status of `completed` is not creative acceptance.

When pixels/video are viewable, inspect the actual result. Check the properties
that matter to the brief:

- identity
- product geometry and markings
- style consistency
- framing
- anatomy/hands
- motion continuity
- start/end state
- camera behavior
- text
- reflections/duplicates
- lip behavior
- audio presence and sync
- duration/aspect/resolution

If actual pixels are unavailable, explicitly mark visual QA as **unverified**.
Never spend credits on a speculative refinement based only on a URL/status.

Repair only the failing asset/index. Preserve every passing property.

## 10. Text policy

For generated video, small labels, captions and exact typography are usually a
post-production concern. Prefer deterministic overlays after the image/video is
accepted.

- Do not rely on video generation to preserve small labels through motion.
- Keep the clean master immutable.
- Subtitles are burned only when requested/workflow-required.
- Subtitle timing comes from the final audio via speech alignment/Whisper, never
  estimated from script timestamps.
- Exact headline text in thumbnails should default to deterministic overlay;
  provider-baked text only when explicitly requested or required by a locked
  workflow.

## 11. Audio policy

Decide the audio owner **before video submission**.

### Native-audio workflows
If the active workflow uses native Seedance/other model speech, do not generate a
second TTS layer unless that workflow explicitly calls for it.

### Narrator workflows
Use one locked voice pair across the complete production. Measure speech, not
file padding. If narration does not fit its window, **rewrite and regenerate the
text**. Never time-stretch, `atempo`, pitch-shift or silently change the voice.
Passed takes are immutable; retry only failing take indices.

### Music videos
The supplied music/audio is timeline authority. Build the beat map before scene
generation. Do not make visuals first and try to force them onto the song later.

## 12. Routing by deliverable

Route to the most specific workflow. Do not improvise a generic chain when a
specialized workflow owns the deliverable.

### Generic image / image edit
Use live model routing. For reference editing, preserve the input and describe
only requested changes. Use inpaint/outpaint/background removal/upscale as
specific utilities when appropriate.

### Generic cinematic video
Use the live video catalog based on required media roles, duration, aspect,
resolution, audio and quality. The latest model name is not automatically the
best model.

### Genjutsu
- **Motion Control:** driving video + reference subject image(s); transfer
  movement/actions/gestures/dance/camera motion.
- **Object Replace:** source video + reference image(s); replace object/product/
  garment/character while preserving the source performance.
- If the web UI shows `Generate — Free`, treat that as a website entitlement.
  Do not spend MCP credits to imitate it unless the user explicitly chooses the
  paid MCP route.

### Product photoshoot
Use the installed product-photoshoot workflow for packshots, lifestyle scenes,
product-person closeups, Pinterest, hero banners, carousels, static ad packs,
tryouts, conceptual CGI and restyles. Keep one product identity across the set.
Refine only failed variants.

### UGC product-only
Real product required. Product is hero; creator is absent/auxiliary. Follow the
installed workflow's board -> de-slop -> native-audio video -> frozen-frame QA ->
assembly sequence.

### UGC review
One authorized/generated adult creator, one locked identity. Product optional.
Never fabricate testimonials, ownership, results, ratings or lived experience.
Claims are an explicit allowlist only.

### UGC unboxing
The unboxing arc owns continuity: sealed package first, reveal next, package
leaves the scene after reveal. Do not invent branded packaging.

### UGC tutorial
Product mechanics must be real and plausible. Global step numbering and exact
step labels belong to the tutorial contract.

### UGC try-on
Wearable product + one locked creator. Preserve silhouette/material/design.
Follow the workflow's pre-wear/worn continuity and no-reflection rules.

### UGC website / SaaS
Use **real captured site pixels**. Never generate or fake the website UI. Talking
head remains the audio spine; site screenshots are composited as real cards.

### Ad Multiplier
Exactly one 4–30s source video. Analyze once. Create ordered independent edits
while preserving source motion/timing/audio and all untargeted text. Raw edits
are silent; restore and verify source audio before delivery. Never deliver raw
silent intermediate results.

### Faceless / narrated multi-scene video
Use the installed faceless workflow only for explicitly faceless/narrator-led
finished videos. Lock style -> complete asset roster -> validated script/manifest
-> generated blocks -> narration -> assembly -> captions/cover as required.
Do not skip its validators. Deliver one finished video, not loose clips.

### Narrator
Use for fixed-window takes, continuous story reads, or the supported on-screen
presenter mode. One voice everywhere. Never time-stretch to fit.

### Subtitles
Transcribe -> verify transcript -> burn -> verify burn. Timing only from final
speech. Preserve the clean master.

### Thumbnail / cover
Truthful information-gap concept -> identity-safe casting -> 4K main render ->
actual visual QC -> surgical edits -> deterministic text overlay by default.
Never pass a style-only thumbnail reference to the generation model.

### Brand assets
Treat official logo/palette/type as constraints. Lock approved slots
independently. Never redraw an official logo if deterministic placement/export
can preserve it. Regenerate only dependent outputs when a lock changes.

### Marketing Studio
Product/entity, avatar, hook/setting, ad reference and format are structured
inputs. Ad-reference-driven and hook/setting-driven approaches are mutually
exclusive. Use the live preset/mode catalog; do not invent IDs.

### Video Explainer
For the official non-photoreal explainer workflow: choose/lock style, create
one-to-one narration and visual blocks, generate the required voice/video assets
in the documented order, then assemble immediately. Real factual topics require
research before scripting.

### Websites / apps / games
Follow the official distinction:
- `website`: standalone product, no Higgsfield generation integration;
- `app`: Higgsfield-authenticated generation product;
- `game`: playable browser game path.
Never imply a normal website silently gains generation APIs.

### 3D
Use the live 3D contract. Single-image or multi-view reconstruction, text-to-3D,
PBR/texturing, remesh, rigging and animation are separate choices. More views of
the same subject improve reconstruction. Never invent hidden geometry from a
reference and call it verified.

### Virality / video analysis
Analysis is not generation. Return the analysis/report, not a fabricated score.
Use it after a finished creative when the goal is hook/attention/retention
assessment.

## 13. Specialized workflow invariants learned from installed Higgsfield skills

These invariants survive routing unless the active skill explicitly says
otherwise:

- Attachments are imported once and their confirmed IDs are reused.
- Authorized HTTPS references may be used when the live surface supports them.
- Distinct creative variants use distinct prompts and stable indices; do not use
  a single `count:N` when prompts differ.
- Sequential dependency chains remain sequential; independent jobs may batch.
- Product/creator/style state is not regenerated mid-chain.
- De-slop/refinement passes preserve composition and change only the targeted
  realism/defect.
- Hard cuts are preferred when the workflow contract says hard cuts; do not
  invent decorative transitions.
- Source audio must survive editing workflows that promise preservation.
- Never show raw job IDs/internal manifests as the normal deliverable.

## 14. Music-video protocol

For a song/chorus clip, especially a 15–30s social cut:

1. Lock the exact audio file and target time range.
2. Produce beat/phrase map with timestamps.
3. Define narrative arc and visual motif for that range.
4. Lock aspect and platform safe zones.
5. Lock hero identity, wardrobe, vehicle/prop and world references.
6. Produce start/end/key frames without paid video if possible.
7. Approve MASTER look.
8. Choose the video model from live requirements, not reputation.
9. Cost one representative shot.
10. Obtain explicit approval.
11. Render one motion proof.
12. QC identity, world, physics, camera, audio timing and style.
13. Repair only that proof until the direction is valid.
14. Only then price and submit the remaining shots.
15. Assemble to the original audio timeline.
16. Add deterministic text/captions only after picture lock.
17. Upscale only accepted footage.
18. Deliver the finished cut plus clean master if requested.

A 21-second clip is a production, not three blind seven-second generations.

## 15. Failure policy

### Billing / quota
Stop immediately. Do not retry a payment/quota/entitlement error.

### Model/schema mismatch
Reload the live model contract. Do not guess a compatible parameter.

### Safety rejection
Do not loop. Rewrite within policy only when the requested intent remains intact.

### Slow/pending job
Poll the same job. Never duplicate it merely because it is slow.

### Creative miss
Inspect actual output, name the failed property, and change only the smallest
necessary variable. Two comparable misses require a plan change or user review.

### Locked-model workflow unavailable
Do not silently substitute. Report the incompatibility and stop that phase.

## 16. Credit ledger

For every paid generation, keep a ledger:

```text
timestamp | project | scene/index | operation | model | params | estimated_cr
          | actual_cr | balance_before | balance_after | job_id | result | retry_of
```

Before a new stage, report:

```text
Current balance
Expected stage cost
Number of paid submits
Expected remaining balance
What has already been approved
```

This ledger is part of production state, not optional accounting.

## 17. Completion definition

A project is not `done` because generation jobs completed. `done` requires:

```text
[ ] requested deliverable exists
[ ] every required scene/asset is present
[ ] actual result passed available visual/mechanical QA
[ ] audio is present/synced when required
[ ] duration/aspect/resolution match the brief
[ ] text/captions are verified when required
[ ] no pending replacement job exists
[ ] final assembly is complete
[ ] user receives the final deliverable, not a list of intermediates
[ ] actual spend is recorded
```

## 18. Standing optimization rule

Optimize in this order:

```text
1. fulfill the brief
2. preserve approved identity/style/product/world
3. avoid unnecessary paid work
4. use the cheapest valid proof
5. minimize retries
6. minimize model switching
7. preserve editable/clean masters
8. scale only after proof
```

**Never optimize for number of generations. Optimize for probability of a usable
finished deliverable per credit spent.**
