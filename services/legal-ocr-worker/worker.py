from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from pypdf import PdfReader

AUDIENCE = "ai-platform-core-legal-ocr"
BROKER_URL = os.getenv(
    "LEGAL_OCR_BROKER_URL",
    "https://hgivyjjethjwswjrvroy.supabase.co/functions/v1/legal-ocr-broker",
)
MAX_JOBS = max(1, min(int(os.getenv("LEGAL_OCR_MAX_JOBS", "2")), 4))
MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
MAX_PAGES = 200
MAX_TEXT_CHARS = 2_400_000
MAX_PAGE_CHARS = 110_000
ALLOWED_FILE_HOSTS = {
    "cdnstatic.rg.ru",
    "rg.ru",
    "publication.pravo.gov.ru",
    "government.ru",
    "www.government.ru",
}
USER_AGENT = "ai-platform-core-legal-ocr/0.68 (GitHub Actions; official documents only)"


def main() -> int:
    processed = 0
    for _ in range(MAX_JOBS):
        job = broker_call({"action": "claim", "metadata": runner_metadata()}).get("job")
        if not job:
            print(json.dumps({"event": "ocr_queue_empty", "processed": processed}, ensure_ascii=False))
            break

        processed += 1
        job_id = str(job["id"])
        started = time.monotonic()
        try:
            result = process_job(job)
            response = broker_call(
                {
                    "action": "complete",
                    "job_id": job_id,
                    "extracted_text": result["combined_text"],
                    "pages": result["pages"],
                    "confidence": result["confidence"],
                    "engine": "ocrmypdf-tesseract-rus-eng-v0.68",
                    "metadata": {
                        **runner_metadata(),
                        "source_sha256": result["source_sha256"],
                        "page_count": result["page_count"],
                        "duration_seconds": round(time.monotonic() - started, 3),
                        "ocr_command": result["ocr_command"],
                    },
                },
                timeout=180,
            )
            print(
                json.dumps(
                    {
                        "event": "ocr_job_completed",
                        "job_id": job_id,
                        "page_count": result["page_count"],
                        "characters": len(result["combined_text"]),
                        "confidence": result["confidence"],
                        "broker_result": response.get("result", {}),
                    },
                    ensure_ascii=False,
                )
            )
        except Exception as exc:  # noqa: BLE001 - job failure must be reported
            message = sanitize_error(exc)
            try:
                broker_call(
                    {
                        "action": "fail",
                        "job_id": job_id,
                        "error": message,
                        "metadata": {
                            **runner_metadata(),
                            "duration_seconds": round(time.monotonic() - started, 3),
                        },
                    }
                )
            finally:
                print(
                    json.dumps(
                        {"event": "ocr_job_failed", "job_id": job_id, "error": message},
                        ensure_ascii=False,
                    )
                )

    return 0


def process_job(job: dict[str, Any]) -> dict[str, Any]:
    file_url = str(job.get("file_url") or "")
    validate_file_url(file_url)

    with tempfile.TemporaryDirectory(prefix="legal-ocr-") as directory:
        workdir = Path(directory)
        source_path = workdir / "source.pdf"
        output_path = workdir / "ocr.pdf"
        download_pdf(file_url, source_path)

        source_hash = sha256_file(source_path)
        page_count = validate_pdf(source_path)
        language = normalize_language(str(job.get("language") or "rus+eng"))

        command = [
            shutil.which("ocrmypdf") or "ocrmypdf",
            "--force-ocr",
            "--deskew",
            "--rotate-pages",
            "--language",
            language,
            "--output-type",
            "pdf",
            "--optimize",
            "1",
            "--jobs",
            "2",
            "--tesseract-timeout",
            "180",
            "--quiet",
            str(source_path),
            str(output_path),
        ]
        subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1_500,
        )

        pages = extract_pages(output_path)
        combined_text = "\n\n".join(page["text"] for page in pages).strip()[:MAX_TEXT_CHARS]
        if len(combined_text) < 80:
            raise RuntimeError("ocr_output_too_short")

        confidence = estimate_confidence(combined_text, page_count)
        return {
            "source_sha256": source_hash,
            "page_count": page_count,
            "pages": pages,
            "combined_text": combined_text,
            "confidence": confidence,
            "ocr_command": "ocrmypdf --force-ocr --deskew --rotate-pages --language rus+eng",
        }


def broker_call(payload: dict[str, Any], timeout: int = 90) -> dict[str, Any]:
    token = request_github_oidc_token()
    response = requests.post(
        BROKER_URL,
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "user-agent": USER_AGENT,
        },
        json=payload,
        timeout=timeout,
    )
    if not response.ok:
        raise RuntimeError(f"broker_http_{response.status_code}:{response.text[:300]}")
    data = response.json()
    if not isinstance(data, dict):
        raise RuntimeError("broker_invalid_response")
    return data


def request_github_oidc_token() -> str:
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not request_url or not request_token:
        raise RuntimeError("github_oidc_environment_missing")

    separator = "&" if "?" in request_url else "?"
    response = requests.get(
        f"{request_url}{separator}audience={AUDIENCE}",
        headers={"authorization": f"bearer {request_token}"},
        timeout=30,
    )
    response.raise_for_status()
    token = response.json().get("value")
    if not isinstance(token, str) or not token:
        raise RuntimeError("github_oidc_token_missing")
    return token


def download_pdf(url: str, destination: Path) -> None:
    with requests.get(
        url,
        headers={
            "user-agent": USER_AGENT,
            "accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.2",
        },
        stream=True,
        timeout=(20, 120),
        allow_redirects=True,
    ) as response:
        response.raise_for_status()
        validate_file_url(response.url)
        total = 0
        with destination.open("wb") as file_handle:
            for chunk in response.iter_content(chunk_size=256 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_DOWNLOAD_BYTES:
                    raise RuntimeError("ocr_source_file_too_large")
                file_handle.write(chunk)

    if destination.stat().st_size < 100:
        raise RuntimeError("ocr_source_file_too_small")
    if destination.read_bytes()[:5] != b"%PDF-":
        raise RuntimeError("ocr_source_is_not_pdf")


def validate_pdf(path: Path) -> int:
    reader = PdfReader(str(path), strict=False)
    count = len(reader.pages)
    if count < 1:
        raise RuntimeError("ocr_pdf_has_no_pages")
    if count > MAX_PAGES:
        raise RuntimeError(f"ocr_pdf_page_limit_exceeded:{count}")
    return count


def extract_pages(path: Path) -> list[dict[str, str]]:
    reader = PdfReader(str(path), strict=False)
    pages: list[dict[str, str]] = []
    for index, page in enumerate(reader.pages, start=1):
        text = normalize_text(page.extract_text() or "")[:MAX_PAGE_CHARS]
        if text:
            pages.append({"locator": f"page:{index}", "text": text})
    if not pages:
        raise RuntimeError("ocr_pdf_text_extraction_empty")
    return pages


def estimate_confidence(text: str, page_count: int) -> float:
    compact = "".join(character for character in text if not character.isspace())
    if not compact:
        return 0.0
    readable = sum(character.isalnum() or character in ".,;:()№%-/«»\"'" for character in compact)
    readable_ratio = readable / len(compact)
    density = min(1.0, len(compact) / max(1, page_count * 900))
    score = 0.45 + readable_ratio * 0.25 + density * 0.15
    return round(min(0.85, max(0.35, score)), 4)


def validate_file_url(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise RuntimeError("ocr_file_url_not_https")
    hostname = parsed.hostname.lower().rstrip(".")
    if hostname not in ALLOWED_FILE_HOSTS:
        raise RuntimeError(f"ocr_file_host_not_allowed:{hostname}")


def normalize_language(value: str) -> str:
    cleaned = "+".join(part for part in value.lower().split("+") if part in {"rus", "eng"})
    return cleaned or "rus+eng"


def normalize_text(value: str) -> str:
    lines = [" ".join(line.replace("\x00", "").split()) for line in value.replace("\r", "\n").split("\n")]
    output: list[str] = []
    for line in lines:
        if not line and output and not output[-1]:
            continue
        output.append(line)
    return "\n".join(output).strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def runner_metadata() -> dict[str, str]:
    keys = {
        "github_run_id": "GITHUB_RUN_ID",
        "github_run_number": "GITHUB_RUN_NUMBER",
        "github_run_attempt": "GITHUB_RUN_ATTEMPT",
        "github_sha": "GITHUB_SHA",
        "github_ref": "GITHUB_REF",
        "github_actor": "GITHUB_ACTOR",
        "runner_os": "RUNNER_OS",
        "runner_arch": "RUNNER_ARCH",
    }
    return {key: os.getenv(environment, "") for key, environment in keys.items()}


def sanitize_error(error: Exception) -> str:
    return " ".join(str(error).split())[:1500] or error.__class__.__name__


if __name__ == "__main__":
    raise SystemExit(main())
