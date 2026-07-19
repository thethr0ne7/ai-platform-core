import type { ProductAdapter } from "../adapters.js";
import type { PlatformRequest, PlatformResult } from "../contracts.js";

export type ProiduEducationLevel = "school" | "spo";

export interface ProiduAdmissionQuery {
  educationLevel: ProiduEducationLevel;
  exams: Record<string, number>;
  region?: string;
}

export interface ProiduQueryEnvelope {
  kind: "proidu.admission-query";
  query: ProiduAdmissionQuery;
}

export class ProiduAdapterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProiduAdapterValidationError";
  }
}

function validateQuery(input: ProiduAdmissionQuery): ProiduAdmissionQuery {
  if (input.educationLevel !== "school" && input.educationLevel !== "spo") {
    throw new ProiduAdapterValidationError("educationLevel must be school or spo");
  }

  const exams = Object.entries(input.exams);
  if (exams.length === 0) {
    throw new ProiduAdapterValidationError("At least one exam score is required");
  }

  for (const [subject, score] of exams) {
    if (!subject.trim()) {
      throw new ProiduAdapterValidationError("Exam subject must not be empty");
    }
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw new ProiduAdapterValidationError(`Invalid score for ${subject}: ${score}`);
    }
  }

  return {
    educationLevel: input.educationLevel,
    exams: Object.fromEntries(exams.map(([subject, score]) => [subject.trim(), score])),
    ...(input.region?.trim() ? { region: input.region.trim() } : {})
  };
}

export const proiduAdapter: ProductAdapter<
  ProiduAdmissionQuery,
  ProiduQueryEnvelope,
  PlatformResult<ProiduQueryEnvelope>
> = {
  id: "proidu.admission-query.v1",
  productId: "proidu",
  action: "system.echo",

  toPlatformRequest(input): PlatformRequest<ProiduQueryEnvelope> {
    return {
      productId: "proidu",
      action: "system.echo",
      payload: {
        kind: "proidu.admission-query",
        query: validateQuery(input)
      }
    };
  },

  fromPlatformResult(result) {
    return result;
  }
};
