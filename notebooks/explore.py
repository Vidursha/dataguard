"""First look at the raw Online Retail II Excel file.

Run it from the project folder:  python notebooks/explore.py
What I found here shaped the cleaning rules in backend/clean.py, and it is
written up in docs/data-quality.md.
"""

import pandas as pd

SHEETS = ["Year 2009-2010", "Year 2010-2011"]

frames = pd.read_excel("data/online_retail_II.xlsx", sheet_name=SHEETS, dtype={"Invoice": str, "StockCode": str})
first, second = frames[SHEETS[0]], frames[SHEETS[1]]
df = pd.concat([first, second], ignore_index=True)
invoice = df["Invoice"].astype(str)

print("Rows per sheet:", {name: len(f) for name, f in frames.items()}, "total:", len(df))
print("Date range per sheet:")
for name, f in frames.items():
    print(f"  {name}: {f['InvoiceDate'].min()} to {f['InvoiceDate'].max()}")

# The two sheets overlap. Are the shared invoices exactly the same?
shared = set(first["Invoice"]) & set(second["Invoice"])
print("Invoices in both sheets:", len(shared))
print("Identical overlapping rows:", len(pd.merge(first, second, how="inner")))

print("Invoice prefixes:", invoice[~invoice.str[0].str.isdigit()].str[0].value_counts().to_dict())
print("Missing descriptions:", int(df["Description"].isna().sum()))
print("Missing Customer ID:", int(df["Customer ID"].isna().sum()))
not_cancel = df[~invoice.str.startswith("C")]
print("Non-cancellation rows with quantity <= 0:", int((not_cancel["Quantity"] <= 0).sum()))
print("Non-cancellation rows with price <= 0:", int((not_cancel["Price"] <= 0).sum()))
print("Exact duplicate rows (all columns):", int(df.duplicated().sum()))

# Stock codes that don't start with five digits are often not real products.
codes = df["StockCode"].astype(str).str.upper()
odd = df[~codes.str.match(r"^\d{5}")]
print("Non-standard stock codes and an example description:")
print(odd.groupby(codes[odd.index])["Description"].first().to_string())
