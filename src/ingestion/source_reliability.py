"""
Source Reliability Layer

Pipeline:
FAILED SOURCE
 -> classify error
 -> select adapter strategy
 -> retry with policy
 -> persist result
 -> update trust score
"""

from dataclasses import dataclass
from enum import Enum


class FailureType(str, Enum):
    FORBIDDEN = "403"
    RATE_LIMIT = "429"
    SERVER_ERROR = "5xx"
    DNS = "dns"
    TLS = "tls"
    TIMEOUT = "timeout"
    UNKNOWN = "unknown"


@dataclass
class RecoveryDecision:
    failure_type: FailureType
    adapter: str
    retry: bool
    max_attempts: int


def classify_failure(status: int | None, error: str | None = None) -> FailureType:
    text = (error or "").lower()
    if "dns" in text or "resolve" in text:
        return FailureType.DNS
    if "tls" in text or "ssl" in text:
        return FailureType.TLS
    if "timeout" in text or "abort" in text:
        return FailureType.TIMEOUT
    if status == 403:
        return FailureType.FORBIDDEN
    if status == 429:
        return FailureType.RATE_LIMIT
    if status and status >= 500:
        return FailureType.SERVER_ERROR
    return FailureType.UNKNOWN


def choose_recovery_adapter(failure: FailureType) -> RecoveryDecision:
    mapping = {
        FailureType.FORBIDDEN: ("sitemap_adapter", True, 3),
        FailureType.RATE_LIMIT: ("backoff_adapter", True, 5),
        FailureType.SERVER_ERROR: ("retry_adapter", True, 4),
        FailureType.DNS: ("source_health_adapter", True, 3),
        FailureType.TLS: ("fallback_transport_adapter", True, 2),
        FailureType.TIMEOUT: ("timeout_retry_adapter", True, 3),
    }
    adapter, retry, attempts = mapping.get(
        failure, ("generic_retry_adapter", True, 2)
    )
    return RecoveryDecision(failure, adapter, retry, attempts)


def update_trust_score(success: bool, current: float = 0.5) -> float:
    if success:
        return min(1.0, current + 0.05)
    return max(0.0, current - 0.1)
