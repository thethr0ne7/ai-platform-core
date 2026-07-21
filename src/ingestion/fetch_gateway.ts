export interface FetchPolicy {
  timeoutMs: number;
  maxResponseBytes: number;
  allowedContentTypes: string[];
}

export interface FetchResult {
  url: string;
  status: number;
  contentType?: string;
  body: string;
}

export interface SafeFetchGateway {
  fetch(url: string, policy: FetchPolicy): Promise<FetchResult>;
}

export class DefaultFetchGateway implements SafeFetchGateway {
  constructor(private readonly validator: (url: string) => Promise<void>) {}

  async fetch(url: string, policy: FetchPolicy): Promise<FetchResult> {
    await this.validator(url);

    const response = await globalThis.fetch(url, {
      signal: AbortSignal.timeout(policy.timeoutMs),
    });

    const contentType = response.headers.get("content-type") ?? undefined;

    if (
      contentType &&
      policy.allowedContentTypes.length > 0 &&
      !policy.allowedContentTypes.some((type) => contentType.includes(type))
    ) {
      throw new Error("unsupported_content_type");
    }

    const body = await response.text();

    if (body.length > policy.maxResponseBytes) {
      throw new Error("content_too_large");
    }

    return {
      url,
      status: response.status,
      contentType,
      body,
    };
  }
}
