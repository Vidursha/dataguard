"""Cleaning rules in backend/clean.py, checked on hand-made frames."""

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
        ("C3", "10001", "GOOD MUG", -2, ts, 1.5, 12345.0, "France"),         # cancellation, same minute: no match
        ("A4", "B", "Adjust bad debt", 1, ts, -100.0, None, "United Kingdom"),  # bad debt
        ("5", "10003", None, 5, ts, 0.0, None, "United Kingdom"),            # missing description
        ("6", "10004", "damaged", -3, ts, 1.0, None, "United Kingdom"),       # negative quantity
        ("7", "10005", "FREE GIFT", 1, ts, 0.0, 1.0, "United Kingdom"),       # zero price
        ("8", "TEST001", "This is a test product.", 1, ts, 1.0, None, "United Kingdom"),
        ("9", "POST", "POSTAGE", 1, ts, 18.0, 12345.0, "France"),            # kept, not a product
    ])
    sales, cancellations, cancelled_sales = clean(standardize(raw))

    assert list(sales["invoice"]) == ["1", "2", "9"]
    assert list(cancellations["invoice"]) == ["C3"]
    assert cancelled_sales.empty  # C3 is not *after* sale 1, so it does not reverse it
    assert list(sales["revenue"]) == [3.0, 3.0, 18.0]
    assert list(sales["is_product"]) == [1, 1, 0]
    assert sales.loc[1, "description"] == "spaced name"
    assert sales.loc[1, "country"] == "Spain"
    assert pd.isna(sales.loc[1, "customer_id"])
    assert sales["customer_id"].dtype == "Int64"


def test_exact_cancellations_remove_the_sale_they_reverse():
    raw = frame([
        # Reversed: same customer, code and quantity, cancelled 12 minutes later.
        ("100", "23843", "PAPER CRAFT , LITTLE BIRDIE", 80995, "2011-12-09 09:15:00", 2.08, 16446.0, "United Kingdom"),
        ("C101", "23843", "PAPER CRAFT , LITTLE BIRDIE", -80995, "2011-12-09 09:27:00", 2.08, 16446.0, "United Kingdom"),
        # Different quantity: a partial return is not an exact reversal.
        ("200", "10001", "MUG", 12, "2010-03-01 10:00:00", 1.0, 2.0, "France"),
        ("C201", "10001", "MUG", -6, "2010-03-02 10:00:00", 1.0, 2.0, "France"),
        # Cancellation dated before the sale: not a reversal of it.
        ("C300", "10002", "BOWL", -4, "2010-04-01 10:00:00", 2.0, 3.0, "Spain"),
        ("301", "10002", "BOWL", 4, "2010-04-02 10:00:00", 2.0, 3.0, "Spain"),
        # Guest cancellation: no customer to match on.
        ("400", "10003", "VASE", 1, "2010-05-01 10:00:00", 5.0, None, "Germany"),
        ("C401", "10003", "VASE", -1, "2010-05-02 10:00:00", 5.0, None, "Germany"),
        # Same item bought twice, cancelled once: only the most recent earlier purchase goes.
        ("500", "10004", "LAMP", 2, "2010-06-01 10:00:00", 10.0, 4.0, "EIRE"),
        ("501", "10004", "LAMP", 2, "2010-06-05 10:00:00", 10.0, 4.0, "EIRE"),
        ("C502", "10004", "LAMP", -2, "2010-06-06 10:00:00", 10.0, 4.0, "EIRE"),
    ])
    sales, cancellations, cancelled_sales = clean(standardize(raw))

    assert list(cancelled_sales["invoice"]) == ["501", "100"]  # sorted by sale date
    assert sorted(sales["invoice"]) == ["200", "301", "400", "500"]
    assert len(cancellations) == 5  # every cancellation is still kept for history
    reversed_birdie = cancelled_sales.set_index("invoice").loc["100"]
    assert reversed_birdie["cancelled_by_invoice"] == "C101"
    assert str(reversed_birdie["cancelled_at"]) == "2011-12-09 09:27:00"
    assert reversed_birdie["revenue"] == round(80995 * 2.08, 2)
