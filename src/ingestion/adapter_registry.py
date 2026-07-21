from dataclasses import dataclass
from typing import Dict


@dataclass
class AdapterDecision:
    adapter: str
    reason: str
    retry_policy: str


class SourceAdapterRegistry:
    """Routes failed official sources to the correct recovery strategy."""

    def __init__(self) -> None:
        self.rules: Dict[str, AdapterDecision] = {
            "403": AdapterDecision("sitemap_adapter", "access denied", "3 retries"),
            "429": AdapterDecision("backoff_adapter", "rate limited", "5 retries"),
            "503": AdapterDecision("retry_adapter", "temporary outage", "5 retries"),
            "dns": AdapterDecision("dns_recovery_adapter", "resolution failure", "3 retries"),
            "tls": AdapterDecision("fallback_transport_adapter", "tls failure", "2 retries"),
            "timeout": AdapterDecision("timeout_retry_adapter", "request timeout", "3 retries"),
        }

    def choose(self, error_type: str) -> AdapterDecision:
        return self.rules.get(
            error_type.lower(),
            AdapterDecision("html_adapter", "default fallback", "1 retry"),
        )
