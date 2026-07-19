import { randomUUID } from "node:crypto";
import { getAction } from "./actions.js";
import { emptyProviderResolver } from "./container.js";
import type {
  PlatformErrorCode,
  PlatformFailure,
  PlatformRequest,
  PlatformResult,
  ProductId
} from "./contracts.js";
import { emptyEventBus, type EventBus, type PlatformEventType } from "./events.js";
import type { ProviderResolver } from "./providers.js";
import { getProduct } from "./registry.js";

function failure(input: {
  code: PlatformErrorCode;
  message: string;
  requestId: string;
  traceId: string;
  startedAt: number;
  productId?: ProductId;
  action?: string;
}): PlatformFailure {
  return {
    ok: false,
    requestId: input.requestId,
    traceId: input.traceId,
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.action ? { action: input.action } : {}),
    durationMs: Date.now() - input.startedAt,
    capabilitiesUsed: [],
    error: { code: input.code, message: input.message }
  };
}

export async function orchestrate<TPayload, TData = unknown>(
  request: PlatformRequest<TPayload>,
  providers: ProviderResolver = emptyProviderResolver,
  events: EventBus = emptyEventBus
): Promise<PlatformResult<TData>> {
  const startedAt = Date.now();
  const requestId = request.requestId?.trim() || randomUUID();
  const traceId = randomUUID();

  const emit = async (type: PlatformEventType, payload: unknown, productId?: ProductId): Promise<void> => {
    await events.publish({
      type,
      requestId,
      traceId,
      ...(productId ? { productId } : {}),
      action: request.action,
      payload
    });
  };

  await emit("request.received", {});
  await emit("request.validated", {});

  const product = getProduct(request.productId);
  if (!product) {
    const result = failure({
      code: "UNKNOWN_PRODUCT",
      message: `Unknown product: ${request.productId}`,
      requestId,
      traceId,
      startedAt,
      productId: request.productId,
      action: request.action
    });
    await emit("action.failed", result.error, request.productId);
    return result;
  }

  await emit("product.resolved", { status: product.status }, product.id);

  if (product.status !== "active") {
    const result = failure({
      code: "PRODUCT_NOT_ACTIVE",
      message: `Product is not active: ${product.id}`,
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
    await emit("action.failed", result.error, product.id);
    return result;
  }

  const handler = getAction(request.action);
  if (!handler) {
    const result = failure({
      code: "UNKNOWN_ACTION",
      message: `Unknown action: ${request.action}`,
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
    await emit("action.failed", result.error, product.id);
    return result;
  }

  await emit("action.resolved", { requiredCapabilities: handler.requiredCapabilities }, product.id);

  const denied = handler.requiredCapabilities.filter(
    (capability) => !product.capabilities.includes(capability)
  );
  await emit("capability.checked", { allowed: denied.length === 0, denied }, product.id);

  if (denied.length > 0) {
    const result = failure({
      code: "CAPABILITY_DENIED",
      message: `Missing capabilities: ${denied.join(", ")}`,
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
    await emit("action.failed", result.error, product.id);
    return result;
  }

  await emit("action.started", {}, product.id);

  try {
    const data = (await handler.execute(request.payload, {
      requestId,
      traceId,
      product,
      action: request.action,
      startedAt,
      providers
    })) as TData;

    const result: PlatformResult<TData> = {
      ok: true,
      requestId,
      traceId,
      productId: product.id,
      action: request.action,
      durationMs: Date.now() - startedAt,
      capabilitiesUsed: handler.requiredCapabilities,
      data
    };
    await emit("action.completed", { durationMs: result.durationMs }, product.id);
    return result;
  } catch (error) {
    const result = failure({
      code: "HANDLER_FAILED",
      message: error instanceof Error ? error.message : "Action handler failed",
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
    await emit("action.failed", result.error, product.id);
    return result;
  }
}
