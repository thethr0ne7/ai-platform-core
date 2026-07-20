import { createHash } from "node:crypto";
import type {
  OpenAIStructuredExtractionAdapter,
  StructuredExtractionResult,
  StructuredMeasureProposal
} from "./government-support-live-pipeline.js";
import type { OfficialDocumentSnapshot } from "./government-support-intelligence.js";

const SCHEMA_VERSION = "government-support-measure/1.0.0";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["measure", "evidence"],
  properties: {
    measure: {
      type: "object",
      additionalProperties: false,
      required: [
        "id", "title", "instrument", "sectors", "applicantTypes", "objectives",
        "eligibleCosts", "maxAmount", "cofinancingPercent", "validFrom", "validTo",
        "conditions", "exclusions"
      ],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        instrument: {
          type: "string",
          enum: ["grant", "subsidy", "concessional-loan", "tax-benefit", "land", "guarantee", "other"]
        },
        sectors: { type: "array", items: { type: "string" } },
        applicantTypes: { type: "array", items: { type: "string" } },
        objectives: { type: "array", items: { type: "string" } },
        eligibleCosts: { type: "array", items: { type: "string" } },
        maxAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
        cofinancingPercent: { anyOf: [{ type: "number" }, { type: "null" }] },
        validFrom: { anyOf: [{ type: "string" }, { type: "null" }] },
        validTo: { anyOf: [{ type: "string" }, { type: "null" }] },
        conditions: { type: "array", items: { type: "string" } },
        exclusions: { type: "array", items: { type: "string" } }
      }
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fieldPath", "fieldValue", "quote", "charStart", "charEnd", "confidence"],
        properties: {
          fieldPath: { type: "string" },
          fieldValue: {},
          quote: { type: "string" },
          charStart: { type: "integer" },
          charEnd: { type: "integer" },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    }
  }
} as const;

const SYSTEM_INSTRUCTION = [
  "Extract one government support measure from the supplied official document.",
  "Return only fields explicitly supported by the document.",
  "For every populated field, add evidence with an exact verbatim quote and character offsets in DOCUMENT_TEXT.",
  "Do not infer legal eligibility, amounts, dates, applicant types or costs.",
  "Use null or empty arrays when the document does not establish a value.",
  "The runtime will reject unsupported evidence."
].join(" ");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeNullableProposal(value: StructuredMeasureProposal): StructuredMeasureProposal {
  const raw = value.measure as StructuredMeasureProposal["measure"] & {
    maxAmount?: number | null;
    cofinancingPercent?: number | null;
    validFrom?: string | null;
    validTo?: string | null;
  };
  return {
    measure: {
      id: raw.id,
      title: raw.title,
      instrument: raw.instrument,
      sectors: raw.sectors,
      applicantTypes: raw.applicantTypes,
      objectives: raw.objectives,
      eligibleCosts: raw.eligibleCosts,
      ...(raw.maxAmount !== null && raw.maxAmount !== undefined ? { maxAmount: raw.maxAmount } : {}),
      ...(raw.cofinancingPercent !== null && raw.cofinancingPercent !== undefined
        ? { cofinancingPercent: raw.cofinancingPercent }
        : {}),
      ...(raw.validFrom ? { validFrom: raw.validFrom } : {}),
      ...(raw.validTo ? { validTo: raw.validTo } : {}),
      conditions: raw.conditions,
      exclusions: raw.exclusions
    },
    evidence: value.evidence
  };
}

interface ResponsesPayload {
  readonly model?: string;
  readonly output_text?: string;
  readonly output?: readonly {
    readonly content?: readonly { readonly type?: string; readonly text?: string }[];
  }[];
  readonly error?: { readonly message?: string };
}

function extractOutputText(payload: ResponsesPayload): string {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("OpenAI response did not contain structured output text");
}

export interface OpenAIExtractorConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class OpenAIGovernmentSupportExtractor implements OpenAIStructuredExtractionAdapter {
  readonly #config: Required<Omit<OpenAIExtractorConfig, "fetchImpl">> & { fetchImpl: typeof fetch };

  constructor(config: OpenAIExtractorConfig) {
    if (!config.apiKey.trim()) throw new Error("OPENAI_API_KEY is required");
    if (!config.model.trim()) throw new Error("OpenAI extraction model is required");
    this.#config = {
      apiKey: config.apiKey,
      model: config.model,
      endpoint: config.endpoint ?? "https://api.openai.com/v1/responses",
      timeoutMs: config.timeoutMs ?? 45_000,
      fetchImpl: config.fetchImpl ?? fetch
    };
  }

  async extract(snapshot: OfficialDocumentSnapshot): Promise<StructuredExtractionResult> {
    const promptHash = sha256(`${SYSTEM_INSTRUCTION}\n${JSON.stringify(EXTRACTION_SCHEMA)}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    try {
      const response = await this.#config.fetchImpl(this.#config.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#config.apiKey}`,
          "content-type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.#config.model,
          store: false,
          input: [
            { role: "system", content: [{ type: "input_text", text: SYSTEM_INSTRUCTION }] },
            {
              role: "user",
              content: [{
                type: "input_text",
                text: `SOURCE_ID: ${snapshot.id}\nSOURCE_URL: ${snapshot.sourceUrl}\nDOCUMENT_TEXT:\n${snapshot.text}`
              }]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "government_support_measure",
              strict: true,
              schema: EXTRACTION_SCHEMA
            }
          }
        })
      });
      const payload = await response.json() as ResponsesPayload;
      if (!response.ok) {
        throw new Error(`OpenAI extraction failed with HTTP ${response.status}: ${payload.error?.message ?? "unknown error"}`);
      }
      const rawText = extractOutputText(payload);
      const proposal = normalizeNullableProposal(JSON.parse(rawText) as StructuredMeasureProposal);
      return {
        model: payload.model ?? this.#config.model,
        schemaVersion: SCHEMA_VERSION,
        promptHash,
        rawResponse: payload,
        proposal
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown extraction failure";
      throw new Error(message.replaceAll(this.#config.apiKey, "[REDACTED]"));
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createOpenAIExtractorFromEnvironment(env: NodeJS.ProcessEnv = process.env): OpenAIGovernmentSupportExtractor {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  return new OpenAIGovernmentSupportExtractor({
    apiKey,
    model: env.OPENAI_EXTRACTION_MODEL ?? "gpt-5-mini"
  });
}
