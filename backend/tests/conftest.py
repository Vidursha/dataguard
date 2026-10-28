"""Shared test fixtures: a tiny database with numbers you can check by hand."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.config import GATEWAY_SECRET_HEADER, Settings
from backend.app.main import create_app
from backend.clean import SCHEMA

SECRET = "test-secret-" + "x" * 32

# (invoice, stock_code, description, quantity, invoice_date, price, customer_id, country, is_product)
ROWS = [
    # Customer 100 (UK): two orders in January 2010
    ("500001", "A1", "RED MUG", 10, "2010-01-05 10:00:00", 2.00, 100, "United Kingdom", 1),
    ("500001", "B2", "BLUE BOWL", 2, "2010-01-05 10:00:00", 5.00, 100, "United Kingdom", 1),
    ("500002", "A1", "RED MUG LARGE", 5, "2010-01-31 23:59:00", 2.00, 100, "United Kingdom", 1),
    # Customer 200 (France): one order in February 2010, with postage
    ("500003", "C3", "GREEN VASE", 1, "2010-02-01 00:00:00", 50.00, 200, "France", 1),
    ("500003", "POST", "POSTAGE", 1, "2010-02-01 00:00:00", 18.00, 200, "France", 0),
    # Guest purchase (no customer) in March 2010, UK
    ("500004", "B2", "BLUE BOWL", 4, "2010-03-15 12:00:00", 5.00, None, "United Kingdom", 1),
]
# Revenues: 500001 = 20 + 10 = 30, 500002 = 10, 500003 = 50 + 18 = 68, 500004 = 20. Total 128.


def build_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA)
        conn.executemany(
            """INSERT INTO sales (invoice, stock_code, description, quantity, invoice_date, price, revenue,
                                  customer_id, country, is_product)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [(inv, code, desc, qty, ts, price, round(qty * price, 2), cust, country, prod)
             for inv, code, desc, qty, ts, price, cust, country, prod in ROWS],
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture(scope="session")
def db_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("db") / "test.db"
    build_db(path)
    return path


@pytest.fixture()
def raw_client(db_path: Path) -> TestClient:
    """A test client that does NOT add the gateway secret, like someone calling the backend directly."""
    return TestClient(create_app(Settings(database_path=db_path, gateway_secret=SECRET)))


@pytest.fixture()
def client(raw_client: TestClient) -> TestClient:
    """A test client that acts like the WSO2 gateway: it adds the shared secret."""
    raw_client.headers[GATEWAY_SECRET_HEADER] = SECRET
    return raw_client
