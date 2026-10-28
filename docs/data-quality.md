# Data quality report

Source: **UCI Online Retail II** (`data/online_retail_II.xlsx`), Chen, D. (2019),
UCI Machine Learning Repository, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The workbook holds
all transactions of a UK-based online gift retailer between 1 December 2009 and
9 December 2011, split over two sheets: `Year 2009-2010` and `Year 2010-2011`.

The cleaning is done by [`backend/clean.py`](../backend/clean.py) and the
exploration that led to these rules is in
[`notebooks/explore.py`](../notebooks/explore.py). Re-running `clean.py`
reproduces every number below.

## Row counts, step by step

| # | Step | Rows before | Rows after | Removed |
|---|------|------------:|-----------:|--------:|
| 0 | Raw rows: sheet 2009-2010 (525,461) + sheet 2010-2011 (541,910) | 1,067,371 | 1,067,371 | 0 |
| 1 | Drop rows duplicated across the two sheets (1-9 Dec 2010) | 1,067,371 | 1,044,848 | 22,523 |
| 2 | Move cancellations to their own table (invoice starts with `C`) | 1,044,848 | 1,025,683 | 19,165 (moved, not lost) |
| 3 | Remove bad-debt adjustments (invoice starts with `A`) | 1,025,683 | 1,025,677 | 6 |
| 4 | Remove rows with a missing description | 1,025,677 | 1,021,402 | 4,275 |
| 5 | Remove zero or negative quantity | 1,021,402 | 1,020,642 | 760 |
| 6 | Remove zero or negative price | 1,020,642 | 1,019,653 | 989 |
| 7 | Remove accounting entries and test items | 1,019,653 | 1,019,567 | 86 |
| 8 | Remove exact duplicate lines | 1,019,567 | 1,007,826 | 11,741 |
| 9 | Move sales reversed by an exact cancellation to `cancelled_sales` | 1,007,826 | 1,001,424 | 6,402 (moved, £709,268.83) |

**Final `sales` table: 1,001,424 rows.** **`cancellations` table: 19,165 rows.**
**`cancelled_sales` table: 6,402 rows.**

| Final figure | Value |
|---|---:|
| Invoices | 39,639 |
| Known customers | 5,842 |
| Guest rows (no Customer ID) | 228,477 (22.8%) |
| Non-product revenue rows (postage, carriage, vouchers...) | 4,315 |
| Total revenue | £19,725,087.52 (was £20,434,356.35 before step 9) |
| Average order value | £497.62 |
| Date range | 2009-12-01 07:45 to 2011-12-09 12:50 |

## What was removed and why

1. **Sheet overlap.** The second sheet starts on 1 December 2010, but the first
   sheet also runs until 9 December 2010. The 22,523 rows in that window are
   identical in both sheets (same 1,088 invoices, same lines). Counting them
   twice would inflate December 2010 revenue, so the copy in the first sheet
   is dropped.
2. **Cancellations.** Invoices starting with `C` reverse an earlier order and
   carry negative quantities. They are not sales, but they are useful history,
   so they go to a separate `cancellations` table instead of being deleted.
   Step 9 then uses them to remove the sales they exactly reverse.
3. **Bad-debt adjustments.** Six rows with invoice numbers starting with `A`
   are bookkeeping entries ("Adjust bad debt"), some with negative prices.
4. **Missing descriptions.** Every one of these rows has a price of zero and
   none has a Customer ID: they are internal stock movements, not sales.
   Without a description we also cannot say what was sold.
5. **Zero or negative quantity.** Outside cancellations these are stock
   write-offs and corrections, with descriptions like "damages", "check",
   "missing" or "?", not customer purchases.
6. **Zero or negative price.** Free or negative-price lines are adjustments
   or samples given away, and would distort average prices and order values.
7. **Accounting entries and test items.** Stock codes `ADJUST`, `ADJUST2`,
   `B`, `BANK CHARGES`, `AMAZONFEE`, `CRUK` (charity commission), `TEST001`
   and `TEST002` describe fees, adjustments or test data, not goods sold.
8. **Exact duplicate lines.** 11,741 lines are identical in every column,
   including the timestamp to the minute. They are almost certainly
   double-scanned or double-exported lines; the data has no line number that
   could prove otherwise, so one copy is kept.
9. **Sales reversed by an exact cancellation.** See the next section.

## What was kept on purpose

- **Guest purchases** (no Customer ID) are real sales. They count towards
  revenue, orders and country totals, but never appear in customer
  endpoints, because there is no customer to report on.
- **Non-product revenue** (stock codes `POST`, `DOT`, `C2`, `C3`, `M`, `S`,
  `D`, `PADS` and `GIFT_*`: postage, carriage, manual entries, samples and gift
  vouchers) is money the shop actually received, so it stays in the sales
  totals. These rows are flagged `is_product = 0` and left out of the
  best-selling products ranking.
- **Country "Unspecified"** and regional values such as "European Community"
  are kept as they are; inventing a country would be worse than reporting the
  value the shop recorded.

## Step 9: cancelled sales

A sale is treated as cancelled when a cancellation exactly reverses it:

- **same customer** (guest cancellations have no customer, so they can't be matched),
- **same stock code**,
- **same absolute quantity** (a sale of 12 and a cancellation of -12),
- and the cancellation is **dated after** the sale.

Matching is one-to-one. Cancellations are processed oldest first, and each one
takes the most recent earlier sale that hasn't already been matched. So a
customer who bought the same item three times and cancelled once loses one
purchase, not three. Matched sales move from `sales` to a `cancelled_sales`
table, together with the cancelling invoice (`cancelled_by_invoice`) and its
time (`cancelled_at`). The cancellation itself stays in `cancellations`.

| Result | Value |
|---|---:|
| Sales lines moved to `cancelled_sales` | 6,402 |
| Revenue moved out of the totals | £709,268.83 (3.5% of the previous total) |
| Revenue before / after | £20,434,356.35 / £19,725,087.52 |
| Invoices before / after | 39,991 / 39,639 |
| Customers before / after | 5,869 / 5,842 (27 customers had only cancelled purchases) |

The two famous outliers are now gone from the sales figures and the top
products:

| Sale | Cancelled by | Revenue removed |
|---|---|---:|
| Invoice 581483, 9 Dec 2011, 80,995 x "PAPER CRAFT, LITTLE BIRDIE", customer 16446 | C581484, 12 minutes later | £168,469.60 |
| Invoice 541431, 18 Jan 2011, 74,215 x "MEDIUM CERAMIC TOP STORAGE JAR", customer 12346 | C541433, 16 minutes later | £77,183.60 |

**Cancellations that did not match** (about 12,700 of 19,165) are kept in
`cancellations` but don't change `sales`, because there is no single sale they
exactly reverse:

| Reason | Approximate lines |
|---|---:|
| Partial return or different quantity (for example bought 12, returned 6) | 9,800 |
| No earlier purchase of that item in the data (bought before December 2009, or the sale was removed in steps 3 to 8) | 1,600 |
| Guest cancellation (no customer to match on) | 719 |
| Discounts, manual adjustments, postage and fees (`D`, `M`, `POST`, ...) | 600 |

Netting partial returns would mean guessing which sale and how much to reduce,
so they are deliberately left alone.

## Standardized types

| Column | Type in SQLite | Notes |
|---|---|---|
| `invoice` | TEXT | Kept as text: some invoice numbers have letter prefixes |
| `stock_code` | TEXT | Upper-cased and trimmed |
| `description` | TEXT | Trimmed, repeated spaces collapsed |
| `quantity` | INTEGER | Always > 0 in `sales` (CHECK constraint) |
| `invoice_date` | TEXT | ISO 8601 `YYYY-MM-DD HH:MM:SS`, sorts and compares correctly as text |
| `price` | REAL | Unit price in GBP, always > 0 (CHECK constraint) |
| `revenue` | REAL | `quantity * price`, rounded to pence |
| `customer_id` | INTEGER | NULL for guest purchases |
| `country` | TEXT | Trimmed |
| `is_product` | INTEGER | 1 for products, 0 for postage, vouchers and similar |

`cancelled_sales` has the same columns as `sales` plus `cancelled_by_invoice`
(TEXT) and `cancelled_at` (TEXT, ISO 8601).

Indexes exist on `sales.invoice_date`, `sales.customer_id` and `sales.country`,
which the API filters and groups by.

## Personal data

`Customer ID` is the only personal data in the set. It is an anonymous number
with no name, email or address attached. Even so, DataGuard treats it as
sensitive: per-customer data needs the separate `customer:read` scope, which
only managers have, and the customer endpoint is left out of the AI agent's MCP
tools entirely.
