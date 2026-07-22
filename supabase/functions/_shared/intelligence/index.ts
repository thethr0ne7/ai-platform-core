import { extractEntities } from "./entity-extractor.ts";
import { buildCanonicalClaims } from "./canonicalizer.ts";
import { buildEvents, detectSignals } from "./signal-engine.ts";
import { detectNarratives } from "./narrative-engine.ts";
import { detectTrajectories } from "./trajectory-engine.ts";
import { buildRelations } from "./graph-engine.ts";
import { buildControlledForecasts } from "./forecast-engine.ts";
import { buildDecisionCards } from "./decision-card-engine.ts";
import {
  ENGINE_VERSION,
  type IntelligenceBundle,
  type IntelligenceContext,
  type IntelligenceDraft,
  type JsonRecord,
  type RuntimeEntity,
} from "./types.ts";

function mergeEntities(...groups: RuntimeEntity[][]): RuntimeEntity[] {
  const merged = new Map<string, RuntimeEntity>();
  for (const entity of groups.flat()) {
    const previous = merged.get(entity.key);
    if (!previous || entity.confidence > previous.confidence) merged.set(entity.key, entity);
  }
  return Array.from(merged.values());
}

export function analyzePreTruthIntelligence(input: {
  projectId: string;
  projectCheckId?: string;
  report: JsonRecord;
}): IntelligenceDraft {
  const context: IntelligenceContext = input;
  const entities = extractEntities(context);
  const events = buildEvents(context);
  const signals = detectSignals(context);
  const trajectories = detectTrajectories(context, signals);
  const narratives = detectNarratives(context, signals);

  return {
    entities,
    claims: [],
    events,
    signals,
    relations: [],
    trajectories,
    narratives,
  };
}

export function finalizeGovernmentIntelligence(input: {
  projectId: string;
  projectCheckId?: string;
  finalReport: JsonRecord;
  preTruth: IntelligenceDraft;
}): IntelligenceBundle {
  const context: IntelligenceContext = {
    projectId: input.projectId,
    ...(input.projectCheckId ? { projectCheckId: input.projectCheckId } : {}),
    report: input.finalReport,
  };
  const finalEntities = extractEntities(context);
  const claims = buildCanonicalClaims(context);
  const relations = buildRelations(context, claims);
  const forecasts = buildControlledForecasts(context, input.preTruth.trajectories, input.preTruth.narratives);
  const decisionCards = buildDecisionCards(context, forecasts);
  const entities = mergeEntities(input.preTruth.entities, finalEntities);

  return {
    engineVersion: ENGINE_VERSION,
    projectId: input.projectId,
    ...(input.projectCheckId ? { projectCheckId: input.projectCheckId } : {}),
    inputKind: "project_report",
    entities,
    claims,
    events: input.preTruth.events,
    signals: input.preTruth.signals,
    relations,
    trajectories: input.preTruth.trajectories,
    narratives: input.preTruth.narratives,
    forecasts,
    decisionCards,
    summary: {
      entities: entities.length,
      claims: claims.length,
      events: input.preTruth.events.length,
      signals: input.preTruth.signals.length,
      relations: relations.length,
      trajectories: input.preTruth.trajectories.length,
      narratives: input.preTruth.narratives.length,
      forecasts: forecasts.length,
      decisionCards: decisionCards.length,
      publishableDecisionCards: decisionCards.filter((card) => card.publishStatus === "published").length,
    },
  };
}

export type { IntelligenceBundle, IntelligenceDraft } from "./types.ts";
