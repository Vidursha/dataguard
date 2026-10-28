"""Response models. Field descriptions end up in the OpenAPI spec, which WSO2
API Manager and its MCP Gateway turn into API docs and AI tool descriptions."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start: date | None = Field(description="First day included (inclusive), or null if unbounded.")
    end: date | None = Field(description="Last day included (inclusive), or null if unbounded.")


class SalesSummary(BaseModel):
    period: DateRange
    total_revenue: float = Field(description="Sum of quantity x unit price in GBP, cancellations excluded.")
    orders: int = Field(description="Number of distinct invoices.")
    average_order_value: float = Field(description="total_revenue / orders in GBP (0 when there are no orders).")
    customers: int = Field(description="Distinct registered customers who ordered. Guest purchases are not counted.")
    units_sold: int = Field(description="Total number of items sold.")


class MonthlyPoint(BaseModel):
    month: str = Field(description="Calendar month as YYYY-MM.", examples=["2010-11"])
    revenue: float = Field(description="Revenue in GBP for the month.")
    orders: int = Field(description="Distinct invoices in the month.")


class MonthlySales(BaseModel):
    period: DateRange
    months: list[MonthlyPoint] = Field(description="One entry per month that has sales, oldest first.")


class CountryRevenue(BaseModel):
    country: str = Field(description="Customer country as recorded by the retailer.")
    revenue: float = Field(description="Revenue in GBP.")
    orders: int = Field(description="Distinct invoices.")
    share: float = Field(description="Share of all revenue, between 0 and 1.")


class CountryBreakdown(BaseModel):
    total_revenue: float = Field(description="Revenue in GBP across all countries.")
    countries: list[CountryRevenue] = Field(description="Countries ranked by revenue, highest first.")


class ProductSales(BaseModel):
    rank: int = Field(description="Position in the ranking, starting at 1.")
    stock_code: str = Field(description="Retailer's product code.")
    description: str = Field(description="Most recent product name used on invoices.")
    units_sold: int = Field(description="Total items sold.")
    revenue: float = Field(description="Revenue in GBP.")
    orders: int = Field(description="Distinct invoices containing the product.")


class TopProducts(BaseModel):
    products: list[ProductSales] = Field(description="Products ranked by revenue, highest first.")


class CustomerSummary(BaseModel):
    customer_id: int = Field(description="Anonymous customer number.")
    country: str = Field(description="Country on the customer's most recent order.")
    orders: int = Field(description="Distinct invoices placed.")
    total_spend: float = Field(description="Lifetime spend in GBP.")
    units_bought: int = Field(description="Total items bought.")
    average_order_value: float = Field(description="total_spend / orders in GBP.")
    first_order: str = Field(description="Date and time of the first order (YYYY-MM-DD HH:MM:SS).")
    last_order: str = Field(description="Date and time of the most recent order (YYYY-MM-DD HH:MM:SS).")


class Health(BaseModel):
    status: str = Field(description="'ok' when the API and database are reachable.")
    database: str = Field(description="'ok' or 'unavailable'.")


class ErrorBody(BaseModel):
    code: str = Field(description="Machine-readable error code, e.g. 'invalid_request'.")
    message: str = Field(description="Human-readable explanation.")
    details: list[dict] | None = Field(default=None, description="Per-field problems for validation errors.")


class ErrorResponse(BaseModel):
    error: ErrorBody
