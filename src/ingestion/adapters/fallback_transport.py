"""Fallback transport adapter for unstable network conditions."""

from .base_adapter import SourceAdapter


class FallbackTransportAdapter(SourceAdapter):
    name = "fallback_transport"

    async def fetch(self, url: str):
        return {
            "adapter": self.name,
            "url": url,
            "status": "transport_retry_required",
        }
