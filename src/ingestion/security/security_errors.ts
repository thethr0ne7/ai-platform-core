export type FetchErrorClass =
  | "dns_error"
  | "tls_error"
  | "timeout"
  | "http_403"
  | "http_404"
  | "http_429"
  | "http_5xx"
  | "redirect_blocked"
  | "private_network_blocked"
  | "invalid_scheme"
  | "content_too_large"
  | "unknown";

export class SafeFetchError extends Error {
  readonly errorClass: FetchErrorClass;
  readonly retryable: boolean;

  constructor(errorClass: FetchErrorClass, message: string, retryable = true) {
    super(message);
    this.name = "SafeFetchError";
    this.errorClass = errorClass;
    this.retryable = retryable;
  }
}
