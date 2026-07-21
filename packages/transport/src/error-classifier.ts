export type TransportErrorClass =
  | "HTTP_403"
  | "HTTP_429"
  | "HTTP_503"
  | "DNS_FAILURE"
  | "TLS_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";

export function classifyTransportError(error: unknown): TransportErrorClass {
  const message = String(error).toLowerCase();

  if (message.includes("timeout")) return "TIMEOUT";
  if (message.includes("dns")) return "DNS_FAILURE";
  if (message.includes("tls") || message.includes("certificate")) return "TLS_ERROR";

  return "UNKNOWN";
}
