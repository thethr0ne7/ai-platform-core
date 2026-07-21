import { randomUUID } from "node:crypto";
import type { MemoryEntry } from "./types.js";

export class MemoryStore {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly maxEntries: number) {}

  list(): MemoryEntry[] {
    return [...this.entries.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  add(input: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): MemoryEntry {
    const duplicate = this.list().find((entry) => entry.content === input.content);
    if (duplicate) return duplicate;

    if (this.entries.size >= this.maxEntries) {
      const oldest = this.list().at(-1);
      if (oldest) this.entries.delete(oldest.id);
    }

    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: randomUUID(),
      content: input.content,
      tags: [...new Set(input.tags)],
      sourceObservationId: input.sourceObservationId,
      createdAt: now,
      updatedAt: now
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  remove(id: string): boolean {
    return this.entries.delete(id);
  }
}
