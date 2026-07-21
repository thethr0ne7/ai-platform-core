import type { LearnedSkill, SkillVersion } from "./types.js";

export interface SkillCandidate {
  name: string;
  description: string;
  instructions: string;
  reason: string;
  tags: string[];
  sourceObservationIds: string[];
  score: number;
}

export class SkillRegistry {
  private readonly skills = new Map<string, LearnedSkill>();
  private readonly pending: SkillCandidate[] = [];

  constructor(private readonly maxVersions: number) {}

  list(): LearnedSkill[] {
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  listPending(): SkillCandidate[] {
    return [...this.pending];
  }

  propose(candidate: SkillCandidate): void {
    this.pending.push(candidate);
  }

  apply(candidate: SkillCandidate): LearnedSkill {
    const now = new Date().toISOString();
    const current = this.skills.get(candidate.name);
    const nextVersion: SkillVersion = {
      version: (current?.versions.at(-1)?.version ?? 0) + 1,
      instructions: candidate.instructions,
      reason: candidate.reason,
      sourceObservationIds: [...new Set(candidate.sourceObservationIds)],
      score: candidate.score,
      createdAt: now,
      active: true
    };

    const previousVersions = (current?.versions ?? []).map((version) => ({ ...version, active: false }));
    const versions = [...previousVersions, nextVersion].slice(-this.maxVersions);
    const skill: LearnedSkill = {
      name: candidate.name,
      description: candidate.description,
      tags: [...new Set([...(current?.tags ?? []), ...candidate.tags])],
      versions,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };

    this.skills.set(skill.name, skill);
    const pendingIndex = this.pending.indexOf(candidate);
    if (pendingIndex >= 0) this.pending.splice(pendingIndex, 1);
    return skill;
  }

  reject(candidate: SkillCandidate): void {
    const index = this.pending.indexOf(candidate);
    if (index >= 0) this.pending.splice(index, 1);
  }
}
