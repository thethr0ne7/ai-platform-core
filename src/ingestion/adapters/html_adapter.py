from .base_adapter import SourceAdapter


class HTMLAdapter(SourceAdapter):
    name = "html"

    async def fetch(self, url: str):
        return {
            "adapter": self.name,
            "url": url,
            "type": "html"
        }
