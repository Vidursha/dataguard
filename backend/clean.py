"""Clean the UCI Online Retail II Excel file and load it into SQLite.

How to run it (from the project folder, with the venv active):
    python backend/clean.py

It reads both sheets of data/online_retail_II.xlsx, throws away rows that are
not real sales, puts cancellations in their own table, moves sales that a
cancellation exactly undoes into cancelled_sales, adds a revenue column and
saves everything to data/dataguard.db. You can run it again any time: it builds
a new database file first and only swaps it in when everything worked.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "online_retail_II.xlsx"
TARGET = ROOT / "data" / "dataguard.db"
SHEETS = ["Year 2009-2010", "Year 2010-2011"]

# The second sheet starts on 1 Dec 2010, but the first sheet also has
# 1-9 Dec 2010. Those rows are exactly the same in both sheets.
OVERLAP_START = pd.Timestamp("2010-12-01")

# Accounting entries and test items. They are not real sales, so they are removed.
NON_SALE_CODES = {"ADJUST", "ADJUST2", "B", "BANK CHARGES", "AMAZONFEE", "CRUK", "TEST001", "TEST002"}

# Lines that are real money but not products (postage, carriage, manual
# entries, samples, discounts, gift vouchers). They count in the sales totals,
# but they are left out of the best-selling products list.
NON_PRODUCT_CODES = {"POST", "DOT", "C2", "C3", "M", "S", "D", "PADS"}

COLUMNS = {
    "Invoice": "invoice",
    "StockCode": "stock_code",
    "Description": "description",
    "Quantity": "quantity",
    "InvoiceDate": "invoice_date",
    "Price": "price",
    "Customer ID": "customer_id",
    "Country": "country",
}


def log(step: str, before: int, after: int) -> None:
    print(f"  {step:<55} {before:>10,} -> {after:>10,}  (-{before - after:,})")


def read_workbook(path: Path) -> tuple[pd.DataFrame, dict[str, int]]:
    """Read both sheets and drop the December 2010 rows that sheet 1 repeats."""
    frames = pd.read_excel(path, sheet_name=SHEETS, dtype={"Invoice": str, "StockCode": str})
    counts = {name: len(df) for name, df in frames.items()}
    first, second = frames[SHEETS[0]], frames[SHEETS[1]]
    overlap = first["InvoiceDate"] >= OVERLAP_START
    counts["overlap"] = int(overlap.sum())
    combined = pd.concat([first[~overlap], second], ignore_index=True)
    return combined.rename(columns=COLUMNS), counts


def standardize(df: pd.DataFrame) -> pd.DataFrame:
    """Give every column a fixed type and trim the text."""
    df = df.copy()
    df["invoice"] = df["invoice"].astype(str).str.strip()
    df["stock_code"] = df["stock_code"].astype(str).str.strip().str.upper()
    df["description"] = df["description"].astype("string").str.strip().str.replace(r"\s+", " ", regex=True)
    df.loc[df["description"] == "", "description"] = pd.NA
    df["quantity"] = df["quantity"].astype("int64")
    df["price"] = df["price"].astype("float64")
    df["customer_id"] = df["customer_id"].astype("Int64")
    df["country"] = df["country"].astype(str).str.strip()
    df["invoice_date"] = pd.to_datetime(df["invoice_date"])
    return df


def match_cancellations(sales: pd.DataFrame, cancellations: pd.DataFrame) -> pd.Series:
    """Match each cancellation to the sale it undoes. One cancellation, one sale.

    A cancellation matches a sale with the same customer, the same stock code and
    the same quantity (ignoring the minus sign), where the sale came first.
    Cancellations are handled oldest first, and each one takes the latest sale that
    isn't matched yet. So if someone bought the same thing three times and
    cancelled once, only one purchase is removed. Guest cancellations have no
    customer, so they never match.

    Returns a Series: the index is the sale row and the value is the cancellation
    row. Sales without a match are not in it.
    """
    keys = ["customer_id", "stock_code", "quantity"]
    sale_side = sales.loc[sales["customer_id"].notna(), keys + ["invoice_date"]]
    cancel_side = cancellations.loc[cancellations["customer_id"].notna() & (cancellations["quantity"] < 0),
                                    keys + ["invoice_date"]].copy()
    cancel_side["quantity"] = -cancel_side["quantity"]
    pairs = (
        cancel_side.reset_index(names="cancel_idx")
        .merge(sale_side.reset_index(names="sale_idx"), on=keys, suffixes=("_cancel", "_sale"))
    )
    pairs = pairs[pairs["invoice_date_sale"] < pairs["invoice_date_cancel"]]
    pairs = pairs.sort_values(["invoice_date_cancel", "cancel_idx", "invoice_date_sale"],
                              ascending=[True, True, False])
    matched: dict[int, int] = {}
    done: set[int] = set()
    for cancel_idx, sale_idx in zip(pairs["cancel_idx"], pairs["sale_idx"]):
        if cancel_idx in done or sale_idx in matched:
            continue
        matched[sale_idx] = cancel_idx
        done.add(cancel_idx)
    return pd.Series(matched, dtype="int64")


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Return (sales, cancellations, cancelled_sales) and print each cleaning step."""
    is_cancel = df["invoice"].str.startswith("C")
    cancellations = df[is_cancel].copy()
    sales = df[~is_cancel]
    log("Move cancellations (invoice starts with 'C')", len(df), len(sales))

    for label, rule in [
        ("Remove bad-debt adjustments (invoice starts with 'A')", lambda d: ~d["invoice"].str.startswith("A")),
        ("Remove missing descriptions", lambda d: d["description"].notna()),
        ("Remove zero or negative quantity", lambda d: d["quantity"] > 0),
        ("Remove zero or negative price", lambda d: d["price"] > 0),
        ("Remove accounting entries and test items", lambda d: ~d["stock_code"].isin(NON_SALE_CODES)),
        ("Remove exact duplicate lines", lambda d: ~d.duplicated()),
    ]:
        before = len(sales)
        sales = sales[rule(sales)]
        log(label, before, len(sales))

    sales = sales.copy()
    sales["revenue"] = (sales["quantity"] * sales["price"]).round(2)
    sales["is_product"] = (
        ~sales["stock_code"].isin(NON_PRODUCT_CODES) & ~sales["stock_code"].str.startswith("GIFT")
    ).astype("int64")

    # Move sales that a later cancellation exactly undoes into cancelled_sales.
    matches = match_cancellations(sales, cancellations)
    cancelled_sales = sales.loc[matches.index].copy()
    cancelled_sales["cancelled_by_invoice"] = cancellations.loc[matches.values, "invoice"].to_numpy()
    cancelled_sales["cancelled_at"] = cancellations.loc[matches.values, "invoice_date"].to_numpy()
    before = len(sales)
    sales = sales.drop(index=matches.index)
    log("Remove sales reversed by an exact cancellation", before, len(sales))
    print(f"  {'':<55} revenue moved to cancelled_sales: GBP {cancelled_sales['revenue'].sum():,.2f}")
    return (sales.reset_index(drop=True), cancellations.reset_index(drop=True),
            cancelled_sales.sort_values("invoice_date").reset_index(drop=True))


SCHEMA = """
CREATE TABLE sales (
    id           INTEGER PRIMARY KEY,
    invoice      TEXT    NOT NULL,
    stock_code   TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    invoice_date TEXT    NOT NULL,   -- ISO 8601 'YYYY-MM-DD HH:MM:SS'
    price        REAL    NOT NULL CHECK (price > 0),
    revenue      REAL    NOT NULL,
    customer_id  INTEGER,            -- NULL for guest purchases
    country      TEXT    NOT NULL,
    is_product   INTEGER NOT NULL    -- 0 for postage, carriage, vouchers etc.
);
CREATE TABLE cancellations (
    id           INTEGER PRIMARY KEY,
    invoice      TEXT    NOT NULL,
    stock_code   TEXT    NOT NULL,
    description  TEXT,
    quantity     INTEGER NOT NULL,
    invoice_date TEXT    NOT NULL,
    price        REAL    NOT NULL,
    customer_id  INTEGER,
    country      TEXT    NOT NULL
);
CREATE TABLE cancelled_sales (      -- sales that a cancellation exactly undid
    id                   INTEGER PRIMARY KEY,
    invoice              TEXT    NOT NULL,
    stock_code           TEXT    NOT NULL,
    description          TEXT    NOT NULL,
    quantity             INTEGER NOT NULL,
    invoice_date         TEXT    NOT NULL,
    price                REAL    NOT NULL,
    revenue              REAL    NOT NULL,
    customer_id          INTEGER NOT NULL,
    country              TEXT    NOT NULL,
    is_product           INTEGER NOT NULL,
    cancelled_by_invoice TEXT    NOT NULL,  -- the 'C...' invoice that cancelled it
    cancelled_at         TEXT    NOT NULL
);
CREATE INDEX idx_sales_invoice_date ON sales (invoice_date);
CREATE INDEX idx_sales_customer_id  ON sales (customer_id);
CREATE INDEX idx_sales_country      ON sales (country);
CREATE INDEX idx_cancellations_invoice_date ON cancellations (invoice_date);
"""


def to_records(df: pd.DataFrame, columns: list[str]) -> list[tuple]:
    """Turn rows into plain Python values (sqlite3 can't handle numpy ints or pd.NA)."""
    out = df[columns].copy()
    out["invoice_date"] = out["invoice_date"].dt.strftime("%Y-%m-%d %H:%M:%S")
    return [
        tuple(None if pd.isna(v) else v.item() if hasattr(v, "item") else v for v in row)
        for row in out.astype(object).itertuples(index=False, name=None)
    ]


def insert(conn: sqlite3.Connection, table: str, df: pd.DataFrame, columns: list[str]) -> None:
    placeholders = ", ".join("?" * len(columns))
    conn.executemany(
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})",
        to_records(df, columns),
    )


SALES_COLUMNS = ["invoice", "stock_code", "description", "quantity", "invoice_date",
                 "price", "revenue", "customer_id", "country", "is_product"]


def load(sales: pd.DataFrame, cancellations: pd.DataFrame, cancelled_sales: pd.DataFrame, target: Path) -> None:
    """Write all the tables to a temp file, then swap it in as the real database."""
    tmp = target.with_suffix(".db.tmp")
    tmp.unlink(missing_ok=True)
    conn = sqlite3.connect(tmp)
    try:
        conn.executescript(SCHEMA)
        insert(conn, "sales", sales, SALES_COLUMNS)
        insert(conn, "cancellations", cancellations, ["invoice", "stock_code", "description", "quantity",
                                                      "invoice_date", "price", "customer_id", "country"])
        dated = cancelled_sales.assign(cancelled_at=cancelled_sales["cancelled_at"].dt.strftime("%Y-%m-%d %H:%M:%S"))
        insert(conn, "cancelled_sales", dated, SALES_COLUMNS + ["cancelled_by_invoice", "cancelled_at"])
        conn.commit()
        conn.execute("ANALYZE")
        conn.commit()
    finally:
        conn.close()  # 'with' only commits, it doesn't close, and Windows needs the file closed
    os.replace(tmp, target)


def main() -> int:
    if not SOURCE.exists():
        print(f"Dataset not found: {SOURCE}", file=sys.stderr)
        return 1
    started = time.time()
    print(f"Reading {SOURCE.name} (both sheets, about a minute)...")
    raw, counts = read_workbook(SOURCE)
    total = counts[SHEETS[0]] + counts[SHEETS[1]]
    print(f"  Rows in '{SHEETS[0]}': {counts[SHEETS[0]]:,}")
    print(f"  Rows in '{SHEETS[1]}': {counts[SHEETS[1]]:,}")
    log("Drop rows duplicated across sheets (1-9 Dec 2010)", total, len(raw))

    sales, cancellations, cancelled_sales = clean(standardize(raw))
    load(sales, cancellations, cancelled_sales, TARGET)

    guests = int(sales["customer_id"].isna().sum())
    print("\nResult")
    print(f"  sales rows:          {len(sales):,}")
    print(f"  cancellation rows:   {len(cancellations):,}")
    print(f"  cancelled sales:     {len(cancelled_sales):,} (GBP {cancelled_sales['revenue'].sum():,.2f})")
    print(f"  guest sales rows:    {guests:,} (no Customer ID)")
    print(f"  non-product rows:    {int((sales['is_product'] == 0).sum()):,}")
    print(f"  customers:           {sales['customer_id'].nunique():,}")
    print(f"  invoices:            {sales['invoice'].nunique():,}")
    print(f"  total revenue (GBP): {sales['revenue'].sum():,.2f}")
    print(f"  date range:          {sales['invoice_date'].min()} to {sales['invoice_date'].max()}")
    print(f"Wrote {TARGET} in {time.time() - started:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
