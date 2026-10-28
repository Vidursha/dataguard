"""Read-only access to the SQLite database."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path


def connect_read_only(path: Path) -> sqlite3.Connection:
    """Open the database in read-only mode, so no endpoint can ever write to it."""
    if not path.exists():
        raise FileNotFoundError(f"Database not found: {path}. Run backend/clean.py first.")
    conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def connection(path: Path) -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one short-lived connection per request."""
    conn = connect_read_only(path)
    try:
        yield conn
    finally:
        conn.close()
