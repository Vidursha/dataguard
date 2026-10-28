"""Opens the SQLite database in read-only mode."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path


def connect_read_only(path: Path) -> sqlite3.Connection:
    """Open the database read-only, so no endpoint can ever change the data."""
    if not path.exists():
        raise FileNotFoundError(f"Database not found: {path}. Run backend/clean.py first.")
    conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def connection(path: Path) -> Iterator[sqlite3.Connection]:
    """Used by FastAPI: each request gets its own connection, closed when it's done."""
    conn = connect_read_only(path)
    try:
        yield conn
    finally:
        conn.close()
