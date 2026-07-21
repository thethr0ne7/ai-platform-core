import type { MemoryEntry } from "./types.js";

export interface MemoryAdapter {
  save(entry: MemoryEntry): Promise<void>;
  list(): Promise<MemoryEntry[]>;
  remove(id: string): Promise<boolean>;
}

export class LocalMemoryAdapter implements MemoryAdapter {
  constructor(private readonly store = new Map<string, MemoryEntry>()) {}

  async save(entry: MemoryEntry): Promise<void> {
    this.store.set(entry.id, entry);
  }

  async list(): Promise<MemoryEntry[]> {
    return [...this.store.values()];
  }

  async remove(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
