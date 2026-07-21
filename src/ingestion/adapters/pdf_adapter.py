from .base_adapter import SourceAdapter


class PDFAdapter(SourceAdapter):
    name = "pdf"

    async def fetch(self, url: str):
        return {
            "adapter": self.name,
            "url": url,
            "type": "pdf"
        }
