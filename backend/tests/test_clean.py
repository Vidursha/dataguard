"""Cleaning rules in backend/clean.py, checked on a hand-made frame."""

from __future__ import annotations

import pandas as pd

from backend.clean import clean, standardize


def frame(rows: list[tuple]) -> pd.DataFrame:
    columns = ["invoice", "stock_code", "description", "quantity", "invoice_date", "price", "customer_id", "country"]
    return pd.DataFrame(rows, columns=columns)


def test_cleaning_rules():
    ts = "2010-05-01 10:00:00"
    raw = frame([
        ("1", "10001", "GOOD MUG", 2, ts, 1.5, 12345.0, "France"),           # kept
        ("2", "10002", " spaced   name ", 1, ts, 3.0, None, " Spain "),       # kept, guest, trimmed
        ("2", "10002", " spaced   name ", 1, ts, 3.0, None, " Spain "),       # exact duplicate
        ("C3", "10001", "GOOD MUG", -2, ts, 1.5, 12345.0, "France"),         # cancellation
        ("A4", "B", "Adjust bad debt", 1, ts, -100.0, None, "United Kingdom"),  # bad debt
        ("5", "10003", None, 5, ts, 0.0, None, "United Kingdom"),            # missing description
        ("6", "10004", "damaged", -3, ts, 1.0, None, "United Kingdom"),       # negative quantity
        ("7", "10005", "FREE GIFT", 1, ts, 0.0, 1.0, "United Kingdom"),       # zero price
        ("8", "TEST001", "This is a test product.", 1, ts, 1.0, None, "United Kingdom"),
        ("9", "POST", "POSTAGE", 1, ts, 18.0, 12345.0, "France"),            # kept, not a product
    ])
    sales, cancellations = clean(standardize(raw))

    assert list(sales["invoice"]) == ["1", "2", "9"]
    assert list(cancellations["invoice"]) == ["C3"]
    assert list(sales["revenue"]) == [3.0, 3.0, 18.0]
    assert list(sales["is_product"]) == [1, 1, 0]
    assert sales.loc[1, "description"] == "spaced name"
    assert sales.loc[1, "country"] == "Spain"
    assert pd.isna(sales.loc[1, "customer_id"])
    assert sales["customer_id"].dtype == "Int64"
