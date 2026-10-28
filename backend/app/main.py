"""DataGuard sales API. It only reads data, and it sits behind WSO2 API Manager.

To run it:  uvicorn backend.app.main:create_app --factory --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import copy
import hmac
import sqlite3
from collections.abc import Iterator
from datetime import date, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .config import GATEWAY_SECRET_HEADER, Settings, load_settings
from .models import (
    CountryBreakdown,
    CountryRevenue,
    CustomerSummary,
    DateRange,
    ErrorResponse,
    Health,
    MonthlyPoint,
    MonthlySales,
    ProductSales,
    SalesSummary,
    TopProducts,
)

API_TITLE = "DataGuard Sales API"
API_VERSION = "1.0.0"
OPEN_PATHS = {"/health"}

DESCRIPTION = """Read-only sales analytics for a UK online gift retailer
(UCI Online Retail II data, December 2009 to December 2011, amounts in GBP).
Cancelled orders are excluded from every figure. Guest purchases (no customer
number) count towards sales totals but never appear in customer endpoints."""

ERRORS = {
    400: {"model": ErrorResponse, "description": "Invalid query or path parameter."},
    403: {"model": ErrorResponse, "description": "Request did not come through the WSO2 gateway."},
}

FromDate = Annotated[
    date | None,
    Query(alias="from", description="First day to include, YYYY-MM-DD (inclusive). Omit for no lower bound.",
          examples=["2010-01-01"]),
]
ToDate = Annotated[
    date | None,
    Query(alias="to", description="Last day to include, YYYY-MM-DD (inclusive). Omit for no upper bound.",
          examples=["2010-12-31"]),
]


def error_response(status: int, code: str, message: str, details: list[dict] | None = None) -> JSONResponse:
    body: dict = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body)


def date_filter(start: date | None, end: date | None) -> tuple[str, list[str]]:
    """Build the WHERE part of the query for a date range. Both dates are included."""
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="'from' must be on or before 'to'.")
    clauses, params = [], []
    if start:
        clauses.append("invoice_date >= ?")
        params.append(start.isoformat())
    if end:
        clauses.append("invoice_date < ?")  # 'before the next day' so the whole 'to' day is included
        params.append((end + timedelta(days=1)).isoformat())
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", params


def get_conn(request: Request) -> Iterator[sqlite3.Connection]:
    """Gives the endpoint a read-only database connection."""
    yield from db.connection(request.app.state.settings.database_path)


Conn = Annotated[sqlite3.Connection, Depends(get_conn)]


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(
        title=API_TITLE,
        version=API_VERSION,
        description=DESCRIPTION,
        docs_url=None,  # no /docs page here, people use the WSO2 Developer Portal instead
        redoc_url=None,
    )

    app.state.settings = settings

    @app.middleware("http")
    async def require_gateway(request: Request, call_next):
        """Block every request that didn't come through WSO2 API Manager.

        The gateway adds the secret header to each call it forwards. compare_digest
        checks it in constant time, so nobody can guess the secret from response times.
        """
        if request.url.path not in OPEN_PATHS:
            supplied = request.headers.get(GATEWAY_SECRET_HEADER, "")
            if not hmac.compare_digest(supplied.encode(), settings.gateway_secret.encode()):
                return error_response(403, "gateway_required",
                                      "This API is only reachable through the WSO2 API Manager gateway.")
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in err["loc"][1:]) or str(err["loc"][0]), "problem": err["msg"]}
            for err in exc.errors()
        ]
        return error_response(400, "invalid_request", "One or more parameters are invalid.", details)

    @app.exception_handler(StarletteHTTPException)
    async def on_http_error(_: Request, exc: StarletteHTTPException):
        codes = {400: "invalid_request", 404: "not_found", 405: "method_not_allowed"}
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        if exc.status_code == 404 and message == "Not Found":
            message = "No such endpoint."
        return error_response(exc.status_code, codes.get(exc.status_code, "error"), message)

    @app.exception_handler(Exception)
    async def on_unexpected_error(_: Request, __: Exception):
        return error_response(500, "internal_error", "Something went wrong on the server.")

    @app.get(
        "/sales/summary",
        operation_id="getSalesSummary",
        summary="Get total revenue, orders and average order value",
        description="Headline sales figures for an optional date range: total revenue in GBP, number of "
                    "orders (invoices), average order value, distinct registered customers and units sold. "
                    "Use this for questions like 'How much did we sell in 2010?'.",
        tags=["Sales"],
        responses=ERRORS,
    )
    def sales_summary(conn: Conn, start: FromDate = None, end: ToDate = None) -> SalesSummary:
        where, params = date_filter(start, end)
        row = conn.execute(
            f"""SELECT COALESCE(SUM(revenue), 0) AS revenue, COUNT(DISTINCT invoice) AS orders,
                       COUNT(DISTINCT customer_id) AS customers, COALESCE(SUM(quantity), 0) AS units
                FROM sales{where}""",
            params,
        ).fetchone()
        revenue, orders = round(row["revenue"], 2), row["orders"]
        return SalesSummary(
            period=DateRange(start=start, end=end),
            total_revenue=revenue,
            orders=orders,
            average_order_value=round(revenue / orders, 2) if orders else 0.0,
            customers=row["customers"],
            units_sold=row["units"],
        )

    @app.get(
        "/sales/monthly",
        operation_id="getMonthlySales",
        summary="Get revenue and orders per month",
        description="Revenue in GBP and number of orders for each calendar month in an optional date range, "
                    "oldest first. Use this for trends and questions like 'Which month had the most sales?'.",
        tags=["Sales"],
        responses=ERRORS,
    )
    def sales_monthly(conn: Conn, start: FromDate = None, end: ToDate = None) -> MonthlySales:
        where, params = date_filter(start, end)
        rows = conn.execute(
            f"""SELECT substr(invoice_date, 1, 7) AS month, SUM(revenue) AS revenue,
                       COUNT(DISTINCT invoice) AS orders
                FROM sales{where} GROUP BY month ORDER BY month""",
            params,
        ).fetchall()
        return MonthlySales(
            period=DateRange(start=start, end=end),
            months=[MonthlyPoint(month=r["month"], revenue=round(r["revenue"], 2), orders=r["orders"])
                    for r in rows],
        )

    @app.get(
        "/sales/by-country",
        operation_id="getRevenueByCountry",
        summary="Get revenue per country",
        description="Countries ranked by revenue in GBP (highest first) with order counts and each country's "
                    "share of total revenue, over the whole data period. Use this for questions like "
                    "'Which countries buy the most?'.",
        tags=["Sales"],
        responses=ERRORS,
    )
    def sales_by_country(
        conn: Conn,
        limit: Annotated[int, Query(ge=1, le=50, description="How many countries to return (1-50).")] = 10,
    ) -> CountryBreakdown:
        total = conn.execute("SELECT COALESCE(SUM(revenue), 0) FROM sales").fetchone()[0]
        rows = conn.execute(
            """SELECT country, SUM(revenue) AS revenue, COUNT(DISTINCT invoice) AS orders
               FROM sales GROUP BY country ORDER BY revenue DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return CountryBreakdown(
            total_revenue=round(total, 2),
            countries=[
                CountryRevenue(country=r["country"], revenue=round(r["revenue"], 2), orders=r["orders"],
                               share=round(r["revenue"] / total, 4) if total else 0.0)
                for r in rows
            ],
        )

    @app.get(
        "/products/top",
        operation_id="getTopProducts",
        summary="Get best-selling products",
        description="Products ranked by revenue in GBP (highest first) with units sold and order counts, over "
                    "the whole data period. Postage, carriage, samples and gift vouchers are excluded. Use "
                    "this for questions like 'What are our best sellers?'.",
        tags=["Products"],
        responses=ERRORS,
    )
    def top_products(
        conn: Conn,
        limit: Annotated[int, Query(ge=1, le=50, description="How many products to return (1-50).")] = 10,
    ) -> TopProducts:
        # In SQLite, a plain column next to MAX() comes from the same row as the max.
        # So 'description' is the name used on the product's latest invoice.
        rows = conn.execute(
            """SELECT stock_code, description, MAX(invoice_date) AS last_sold,
                      SUM(quantity) AS units, SUM(revenue) AS revenue, COUNT(DISTINCT invoice) AS orders
               FROM sales WHERE is_product = 1
               GROUP BY stock_code ORDER BY revenue DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return TopProducts(products=[
            ProductSales(rank=i, stock_code=r["stock_code"], description=r["description"],
                         units_sold=r["units"], revenue=round(r["revenue"], 2), orders=r["orders"])
            for i, r in enumerate(rows, start=1)
        ])

    @app.get(
        "/customers/{customer_id}/summary",
        operation_id="getCustomerSummary",
        summary="Get one customer's order history summary",
        description="Orders, lifetime spend, units bought, average order value and first and last order "
                    "dates for one registered customer. Requires the customer:read scope. Guest purchases "
                    "have no customer number and are never returned.",
        tags=["Customers"],
        responses={**ERRORS, 404: {"model": ErrorResponse, "description": "No registered customer with this ID."}},
    )
    def customer_summary(
        conn: Conn,
        customer_id: Annotated[int, Path(ge=1, le=99_999_999, description="Customer number, e.g. 12347.")],
    ) -> CustomerSummary:
        # NULL never equals anything, so guest purchases can never show up here.
        row = conn.execute(
            """SELECT COUNT(DISTINCT invoice) AS orders, SUM(revenue) AS spend, SUM(quantity) AS units,
                      MIN(invoice_date) AS first_order, MAX(invoice_date) AS last_order, country
               FROM sales WHERE customer_id = ?""",
            (customer_id,),
        ).fetchone()
        if not row["orders"]:
            raise HTTPException(status_code=404, detail=f"No registered customer with ID {customer_id}.")
        spend = round(row["spend"], 2)
        return CustomerSummary(
            customer_id=customer_id, country=row["country"], orders=row["orders"], total_spend=spend,
            units_bought=row["units"], average_order_value=round(spend / row["orders"], 2),
            first_order=row["first_order"], last_order=row["last_order"],
        )

    @app.get(
        "/health",
        operation_id="getHealth",
        summary="Check that the API and database are up",
        description="Liveness and database check for monitoring. Does not return any business data.",
        tags=["Monitoring"],
        response_model=Health,
    )
    def health() -> JSONResponse:
        try:
            conn = db.connect_read_only(settings.database_path)
            try:
                conn.execute("SELECT 1 FROM sales LIMIT 1").fetchone()
            finally:
                conn.close()
        except (sqlite3.Error, FileNotFoundError):
            return JSONResponse(status_code=503, content=Health(status="degraded", database="unavailable").model_dump())
        return JSONResponse(content=Health(status="ok", database="ok").model_dump())

    return app


def build_openapi(app: FastAPI) -> dict:
    """Make the OpenAPI document we import into WSO2. /health is left out.

    FastAPI writes optional query parameters as anyOf [type, null]. They are turned
    back into the plain type, so the MCP tools WSO2 builds from this spec still
    know that a date is a date.
    """
    spec = copy.deepcopy(app.openapi())
    spec["paths"].pop("/health", None)
    for path in spec["paths"].values():
        for operation in path.values():
            for param in operation.get("parameters", []):
                options = param.get("schema", {}).get("anyOf", [])
                non_null = [o for o in options if o.get("type") != "null"]
                if options and len(non_null) == 1:
                    extra = {k: v for k, v in param["schema"].items() if k != "anyOf"}
                    param["schema"] = {**non_null[0], **extra}
    return spec

