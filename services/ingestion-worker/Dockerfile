FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY worker ./worker

RUN pip install --upgrade pip \
    && pip install . \
    && playwright install --with-deps chromium

USER 65532:65532

ENTRYPOINT ["ai-platform-ingestion"]
