from .base_adapter import SourceAdapter


class SitemapAdapter(SourceAdapter):
    name = "sitemap"

    async def fetch(self, url: str):
        return {
            "adapter": self.name,
            "url": url,
            "type": "sitemap"
        }
