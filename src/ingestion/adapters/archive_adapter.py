"""Archive fallback adapter.

Used when primary official endpoints are temporarily unavailable.
"""

from .base_adapter import SourceAdapter


class ArchiveAdapter(SourceAdapter):
    name = "archive_adapter"

    async def fetch(self, url: str):
        return {
            "adapter": self.name,
            "url": url,
            "status": "fallback_required",
        }
