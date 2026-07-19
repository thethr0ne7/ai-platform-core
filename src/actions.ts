import type { ActionHandler } from "./contracts.js";

const handlers = new Map<string, ActionHandler>();

export function registerAction(handler: ActionHandler): void {
  if (handlers.has(handler.action)) {
    throw new Error(`Action already registered: ${handler.action}`);
  }

  handlers.set(handler.action, handler);
}

export function getAction(action: string): ActionHandler | undefined {
  return handlers.get(action);
}

export function listActions(): string[] {
  return [...handlers.keys()].sort();
}

registerAction({
  action: "system.echo",
  requiredCapabilities: ["orchestration"],
  async execute(payload) {
    return payload;
  }
});
