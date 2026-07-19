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
  providers: ProviderResolver = emptyProviderResolver
): Promise<PlatformResult<TData>> {
  const startedAt = Date.now();
  const requestId = request.requestId?.trim() || randomUUID();
  const traceId = randomUUID();
  const product = getProduct(request.productId);

  if (!product) {
    return failure({
      code: "UNKNOWN_PRODUCT",
      message: `Unknown product: ${request.productId}`,
      requestId,
      traceId,
      startedAt,
      productId: request.productId,
      action: request.action
    });
  }

  if (product.status !== "active") {
    return failure({
      code: "PRODUCT_NOT_ACTIVE",
      message: `Product is not active: ${product.id}`,
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
  }

  const handler = getAction(request.action);
  if (!handler) {
    return failure({
      code: "UNKNOWN_ACTION",
      message: `Unknown action: ${request.action}`,
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
  }

  const denied = handler.requiredCapabilities.filter(
    (capability) => !product.capabilities.includes(capability)
  );

  if (denied.length > 0) {
    return failure({
      code: "CAPABILITY_DENIED",
      message: `Missing capabilities: ${denied.join(", ")}`,
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
  }

  try {
    const data = (await handler.execute(request.payload, {
      requestId,
      traceId,
      product,
      action: request.action,
      startedAt,
      providers
    })) as TData;

    return {
      ok: true,
      requestId,
      traceId,
      productId: product.id,
      action: request.action,
      durationMs: Date.now() - startedAt,
      capabilitiesUsed: handler.requiredCapabilities,
      data
    };
  } catch (error) {
    return failure({
      code: "HANDLER_FAILED",
      message: error instanceof Error ? error.message : "Action handler failed",
      requestId,
      traceId,
      startedAt,
      productId: product.id,
      action: request.action
    });
  }
}
