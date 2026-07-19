import { randomUUID } from "node:crypto";
import type { ProductId } from "./contracts.js";

export type PlatformEventType =
  | "request.received"
  | "request.validated"
  | "product.resolved"
  | "action.resolved"
  | "capability.checked"
  | "action.started"
  | "action.completed"
  | "action.failed"
  | "memory.write.requested"
  | "memory.write.completed"
  | "memory.write.rejected"
  | "memory.version.created"
  | "evidence.attached"
  | "retrieval.search.requested"
  | "retrieval.search.completed"
  | "retrieval.search.rejected";

export type EventDispatchMode = "best-effort" | "strict";

export interface PlatformEvent<TPayload = unknown> {
  eventId: string;
  type: PlatformEventType;
  timestamp: string;
  requestId: string;
  traceId: string;
  productId?: ProductId;
  action?: string;
  payload: TPayload;
}

export interface PlatformEventInput<TPayload = unknown> {
  type: PlatformEventType;
  requestId: string;
  traceId: string;
  productId?: ProductId;
  action?: string;
  payload: TPayload;
}

export type PlatformEventHandler = (event: PlatformEvent) => void | Promise<void>;

export interface EventBus {
  publish<TPayload>(event: PlatformEventInput<TPayload>): Promise<PlatformEvent<TPayload>>;
  subscribe(type: PlatformEventType | "*", handler: PlatformEventHandler): () => void;
}

export class EventDispatchError extends Error {
  readonly event: PlatformEvent;
  readonly causes: unknown[];

  constructor(event: PlatformEvent, causes: unknown[]) {
    super(`Event dispatch failed for ${event.type}`);
    this.name = "EventDispatchError";
    this.event = event;
    this.causes = causes;
  }
}

export class InMemoryEventBus implements EventBus {
  readonly #subscriptions = new Map<PlatformEventType | "*", Set<PlatformEventHandler>>();

  constructor(readonly mode: EventDispatchMode = "best-effort") {}

  subscribe(type: PlatformEventType | "*", handler: PlatformEventHandler): () => void {
    const handlers = this.#subscriptions.get(type) ?? new Set<PlatformEventHandler>();
    handlers.add(handler);
    this.#subscriptions.set(type, handlers);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.#subscriptions.delete(type);
    };
  }

  async publish<TPayload>(input: PlatformEventInput<TPayload>): Promise<PlatformEvent<TPayload>> {
    const event: PlatformEvent<TPayload> = {
      eventId: randomUUID(),
      type: input.type,
      timestamp: new Date().toISOString(),
      requestId: input.requestId,
      traceId: input.traceId,
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.action ? { action: input.action } : {}),
      payload: input.payload
    };

    const handlers = [
      ...(this.#subscriptions.get(event.type) ?? []),
      ...(this.#subscriptions.get("*") ?? [])
    ];
    const failures: unknown[] = [];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0 && this.mode === "strict") {
      throw new EventDispatchError(event, failures);
    }

    return event;
  }
}

export const emptyEventBus: EventBus = Object.freeze({
  async publish<TPayload>(input: PlatformEventInput<TPayload>): Promise<PlatformEvent<TPayload>> {
    return {
      eventId: randomUUID(),
      type: input.type,
      timestamp: new Date().toISOString(),
      requestId: input.requestId,
      traceId: input.traceId,
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.action ? { action: input.action } : {}),
      payload: input.payload
    };
  },
  subscribe: () => () => undefined
});