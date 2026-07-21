from .base_adapter import SourceAdapter


class APIAdapter(SourceAdapter):
    name = "api"

    async def fetch(self, url: str):
        return {
            "adapter": self.name,
            "url": url,
            "type": "api"
        }
