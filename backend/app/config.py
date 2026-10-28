"""Runtime settings, read from environment variables and the git-ignored .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
GATEWAY_SECRET_HEADER = "X-DataGuard-Gateway-Secret"
MIN_SECRET_LENGTH = 32


@dataclass(frozen=True)
class Settings:
    database_path: Path
    gateway_secret: str


def load_settings() -> Settings:
    """Load settings, failing fast if the gateway secret is missing or weak.

    Starting without a secret would mean either rejecting every request or
    accepting every request; neither is acceptable, so we refuse to start.
    """
    load_dotenv(ROOT / ".env")
    secret = os.environ.get("GATEWAY_SHARED_SECRET", "")
    if len(secret) < MIN_SECRET_LENGTH:
        raise RuntimeError(
            f"GATEWAY_SHARED_SECRET must be set (at least {MIN_SECRET_LENGTH} characters). "
            "Copy .env.example to .env and run wso2/scripts/generate_env.py."
        )
    db = Path(os.environ.get("DATAGUARD_DB", ROOT / "data" / "dataguard.db"))
    return Settings(database_path=db, gateway_secret=secret)
