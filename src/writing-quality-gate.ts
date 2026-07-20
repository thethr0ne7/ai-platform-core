export type WritingDimension = "directness" | "rhythm" | "trust" | "authenticity" | "density";

export interface ProtectedSpan {
  readonly text: string;
  readonly kind: "verified-evidence" | "legal-name" | "source-title";
}

export interface WritingViolation {
  readonly code:
    | "throat-clearing"
    | "binary-contrast"
    | "vague-declarative"
    | "em-dash"
    | "passive-marker"
    | "metronomic-rhythm"
    | "excess-density";
  readonly message: string;
  readonly excerpt: string;
  readonly penalty: Partial<Record<WritingDimension, number>>;
}

export interface WritingQualityResult {
  readonly scores: Readonly<Record<WritingDimension, number>>;
  readonly total: number;
  readonly threshold: number;
  readonly passed: boolean;
  readonly violations: readonly WritingViolation[];
  readonly protectedSpansPreserved: boolean;
}

export interface WritingQualityInput {
  readonly text: string;
  readonly protectedSpans?: readonly ProtectedSpan[];
  readonly threshold?: number;
}

const throatClearing = [
  /\bвот что важно\b/giu,
  /\bважно отметить\b/giu,
  /\bследует отметить\b/giu,
  /\bдавайте разбер[её]мся\b/giu,
  /\bпо сути дела\b/giu,
  /\bнельзя не отметить\b/giu,
  /\bhere(?:'s| is) what\b/giu,
  /\bit is important to note\b/giu
];

const binaryContrast = [
  /\bне\s+[^.!?]{1,80},?\s+(?:а|но)\s+[^.!?]{1,80}/giu,
  /\bnot\s+[^.!?]{1,80},?\s+but\s+[^.!?]{1,80}/giu
];

const vagueDeclaratives = [
  /\b(?:последствия|выводы|причины|перспективы)\s+(?:значительны|очевидны|структурны|масштабны)\b/giu,
  /\b(?:это|данный подход)\s+(?:важно|значимо|эффективно)\b/giu,
  /\bthe implications are significant\b/giu
];

const passiveMarkers = [
  /\b(?:было|были|будет|будут)\s+(?:сделано|создано|проведено|реализовано|определено|установлено)\b/giu,
  /\b(?:is|are|was|were|will be)\s+(?:created|implemented|defined|determined|performed)\b/giu
];

function protectedRanges(text: string, spans: readonly ProtectedSpan[]): ReadonlyArray<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  for (const span of spans) {
    let start = text.indexOf(span.text);
    while (start >= 0) {
      ranges.push([start, start + span.text.length]);
      start = text.indexOf(span.text, start + span.text.length);
    }
  }
  return ranges;
}

function overlapsProtected(start: number, end: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  return ranges.some(([left, right]) => start < right && end > left);
}

function addPatternViolations(
  text: string,
  ranges: ReadonlyArray<readonly [number, number]>,
  patterns: readonly RegExp[],
  create: (excerpt: string) => WritingViolation,
  output: WritingViolation[]
): void {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const excerpt = match[0] ?? "";
      if (!excerpt) continue;
      if (!overlapsProtected(start, start + excerpt.length, ranges)) output.push(create(excerpt));
    }
  }
}

function sentenceLengths(text: string): number[] {
  return text
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim().split(/\s+/u).filter(Boolean).length)
    .filter((length) => length > 0);
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, value));
}

export function evaluateWritingQuality(input: WritingQualityInput): WritingQualityResult {
  const threshold = input.threshold ?? 35;
  if (threshold < 5 || threshold > 50) throw new Error("Writing threshold must be between 5 and 50");

  const spans = input.protectedSpans ?? [];
  const ranges = protectedRanges(input.text, spans);
  const violations: WritingViolation[] = [];

  addPatternViolations(input.text, ranges, throatClearing, (excerpt) => ({
    code: "throat-clearing",
    message: "Start with the substantive statement; remove the announcement.",
    excerpt,
    penalty: { directness: 2, density: 1 }
  }), violations);

  addPatternViolations(input.text, ranges, binaryContrast, (excerpt) => ({
    code: "binary-contrast",
    message: "State the positive claim directly instead of using a formulaic not-X-but-Y contrast.",
    excerpt,
    penalty: { authenticity: 2, directness: 1 }
  }), violations);

  addPatternViolations(input.text, ranges, vagueDeclaratives, (excerpt) => ({
    code: "vague-declarative",
    message: "Name the concrete consequence, actor or condition.",
    excerpt,
    penalty: { trust: 2, density: 1 }
  }), violations);

  addPatternViolations(input.text, ranges, passiveMarkers, (excerpt) => ({
    code: "passive-marker",
    message: "Name the responsible actor and use active voice where the source supports it.",
    excerpt,
    penalty: { directness: 1, trust: 1 }
  }), violations);

  for (const match of input.text.matchAll(/—/gu)) {
    const start = match.index ?? 0;
    if (!overlapsProtected(start, start + 1, ranges)) violations.push({
      code: "em-dash",
      message: "Replace the em dash with punctuation that makes the relationship explicit.",
      excerpt: "—",
      penalty: { rhythm: 1 }
    });
  }

  const lengths = sentenceLengths(input.text);
  for (let index = 0; index + 2 < lengths.length; index += 1) {
    const group = lengths.slice(index, index + 3);
    if (Math.max(...group) - Math.min(...group) <= 2) {
      violations.push({
        code: "metronomic-rhythm",
        message: "Vary the length or structure of adjacent sentences.",
        excerpt: `sentence lengths ${group.join("/")}`,
        penalty: { rhythm: 2, authenticity: 1 }
      });
      break;
    }
  }

  const words = input.text.trim().split(/\s+/u).filter(Boolean).length;
  const paragraphCount = Math.max(1, input.text.split(/\n\s*\n/u).length);
  if (words / paragraphCount > 140) violations.push({
    code: "excess-density",
    message: "Split the paragraph or remove material that does not change the decision.",
    excerpt: `${Math.round(words / paragraphCount)} words per paragraph`,
    penalty: { density: 2, trust: 1 }
  });

  const raw: Record<WritingDimension, number> = {
    directness: 10,
    rhythm: 10,
    trust: 10,
    authenticity: 10,
    density: 10
  };
  for (const violation of violations) {
    for (const [dimension, penalty] of Object.entries(violation.penalty) as Array<[WritingDimension, number]>) {
      raw[dimension] -= penalty;
    }
  }
  const scores: Record<WritingDimension, number> = {
    directness: clampScore(raw.directness),
    rhythm: clampScore(raw.rhythm),
    trust: clampScore(raw.trust),
    authenticity: clampScore(raw.authenticity),
    density: clampScore(raw.density)
  };
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const protectedSpansPreserved = spans.every((span) => input.text.includes(span.text));

  return {
    scores,
    total,
    threshold,
    passed: protectedSpansPreserved && total >= threshold,
    violations,
    protectedSpansPreserved
  };
}

export interface PublishGateInput extends WritingQualityInput {
  readonly evidenceValidated: boolean;
  readonly domainValidated: boolean;
}

export interface PublishGateResult {
  readonly canShip: boolean;
  readonly blockers: readonly string[];
  readonly writing: WritingQualityResult;
}

export function evaluatePublishGate(input: PublishGateInput): PublishGateResult {
  const writing = evaluateWritingQuality(input);
  const blockers: string[] = [];
  if (!input.evidenceValidated) blockers.push("Evidence validation has not passed");
  if (!input.domainValidated) blockers.push("Domain validation has not passed");
  if (!writing.protectedSpansPreserved) blockers.push("A protected evidence or legal span was changed or removed");
  if (!writing.passed) blockers.push(`Writing quality score ${writing.total}/50 is below ${writing.threshold}/50`);
  return { canShip: blockers.length === 0, blockers, writing };
}
