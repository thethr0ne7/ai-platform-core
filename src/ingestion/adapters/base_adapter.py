from abc import ABC, abstractmethod


class SourceAdapter(ABC):
    name = "base"

    @abstractmethod
    async def fetch(self, url: str):
        raise NotImplementedError

    async def validate(self, result):
        return result is not None
