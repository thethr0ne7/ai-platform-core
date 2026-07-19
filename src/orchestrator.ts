import type { PlatformRequest, PlatformResult } from "./contracts.js";
import { getProduct } from "./registry.js";

export async function orchestrate<TPayload, TData = TPayload>(
  request: PlatformRequest<TPayload>
): Promise<PlatformResult<TData>> {
  const product = getProduct(request.productId);

  if (!product) {
    return {
      requestId: request.requestId,
      productId: request.productId,
      status: "rejected",
      capabilitiesUsed: [],
      error: `Unknown product: ${request.productId}`
    };
  }

  return {
    requestId: request.requestId,
    productId: request.productId,
    status: "completed",
    capabilitiesUsed: product.capabilities,
    data: request.payload as unknown as TData
  };
}
