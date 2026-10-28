"""Endpoint behaviour: figures, filters, validation and error format."""

from __future__ import annotations

import pytest


def assert_error(response, status: int, code: str) -> dict:
    assert response.status_code == status
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]
    return body["error"]


class TestSalesSummary:
    def test_all_time(self, client):
        body = client.get("/sales/summary").json()
        assert body["total_revenue"] == 128.0
        assert body["orders"] == 4
        assert body["average_order_value"] == 32.0
        assert body["customers"] == 2  # the guest is not a customer
        assert body["units_sold"] == 23
        assert body["period"] == {"start": None, "end": None}

    def test_date_range_is_inclusive(self, client):
        # 'to' = 2010-01-31 must include the order placed at 23:59 that day.
        body = client.get("/sales/summary", params={"from": "2010-01-01", "to": "2010-01-31"}).json()
        assert body["total_revenue"] == 40.0
        assert body["orders"] == 2
        assert body["period"] == {"start": "2010-01-01", "end": "2010-01-31"}

    def test_guest_sales_count_in_totals(self, client):
        body = client.get("/sales/summary", params={"from": "2010-03-01", "to": "2010-03-31"}).json()
        assert body["total_revenue"] == 20.0
        assert body["orders"] == 1
        assert body["customers"] == 0

    def test_empty_range(self, client):
        body = client.get("/sales/summary", params={"from": "2020-01-01"}).json()
        assert body["total_revenue"] == 0
        assert body["orders"] == 0
        assert body["average_order_value"] == 0

    def test_from_after_to_is_rejected(self, client):
        error = assert_error(client.get("/sales/summary", params={"from": "2010-02-01", "to": "2010-01-01"}),
                             400, "invalid_request")
        assert "'from'" in error["message"]

    @pytest.mark.parametrize("bad", ["yesterday", "2010-13-01", "2010-02-30", "01/02/2010"])
    def test_bad_dates_are_rejected(self, client, bad):
        error = assert_error(client.get("/sales/summary", params={"from": bad}), 400, "invalid_request")
        assert error["details"][0]["field"] == "from"


class TestMonthly:
    def test_months_in_order(self, client):
        months = client.get("/sales/monthly").json()["months"]
        assert months == [
            {"month": "2010-01", "revenue": 40.0, "orders": 2},
            {"month": "2010-02", "revenue": 68.0, "orders": 1},
            {"month": "2010-03", "revenue": 20.0, "orders": 1},
        ]

    def test_filtered(self, client):
        months = client.get("/sales/monthly", params={"from": "2010-02-01", "to": "2010-02-28"}).json()["months"]
        assert [m["month"] for m in months] == ["2010-02"]

    def test_bad_range(self, client):
        assert_error(client.get("/sales/monthly", params={"to": "not-a-date"}), 400, "invalid_request")


class TestByCountry:
    def test_ranked_by_revenue_with_share(self, client):
        body = client.get("/sales/by-country").json()
        assert body["total_revenue"] == 128.0
        assert body["countries"] == [
            {"country": "France", "revenue": 68.0, "orders": 1, "share": 0.5312},
            {"country": "United Kingdom", "revenue": 60.0, "orders": 3, "share": 0.4688},
        ]

    def test_limit(self, client):
        assert len(client.get("/sales/by-country", params={"limit": 1}).json()["countries"]) == 1

    @pytest.mark.parametrize("limit", ["0", "51", "-1", "ten", "2.5"])
    def test_bad_limit(self, client, limit):
        error = assert_error(client.get("/sales/by-country", params={"limit": limit}), 400, "invalid_request")
        assert error["details"][0]["field"] == "limit"


class TestTopProducts:
    def test_ranked_by_revenue_without_postage(self, client):
        products = client.get("/products/top").json()["products"]
        assert [p["stock_code"] for p in products] == ["C3", "B2", "A1"]
        assert "POST" not in {p["stock_code"] for p in products}
        assert products[0] == {"rank": 1, "stock_code": "C3", "description": "GREEN VASE",
                               "units_sold": 1, "revenue": 50.0, "orders": 1}

    def test_uses_most_recent_description(self, client):
        a1 = next(p for p in client.get("/products/top").json()["products"] if p["stock_code"] == "A1")
        assert a1["description"] == "RED MUG LARGE"
        assert a1["units_sold"] == 15
        assert a1["orders"] == 2

    def test_limit(self, client):
        products = client.get("/products/top", params={"limit": 2}).json()["products"]
        assert [p["rank"] for p in products] == [1, 2]

    @pytest.mark.parametrize("limit", ["0", "51", "abc"])
    def test_bad_limit(self, client, limit):
        assert_error(client.get("/products/top", params={"limit": limit}), 400, "invalid_request")

    def test_limit_bounds_are_allowed(self, client):
        assert client.get("/products/top", params={"limit": 1}).status_code == 200
        assert client.get("/products/top", params={"limit": 50}).status_code == 200


class TestCustomerSummary:
    def test_known_customer(self, client):
        assert client.get("/customers/100/summary").json() == {
            "customer_id": 100,
            "country": "United Kingdom",
            "orders": 2,
            "total_spend": 40.0,
            "units_bought": 17,
            "average_order_value": 20.0,
            "first_order": "2010-01-05 10:00:00",
            "last_order": "2010-01-31 23:59:00",
        }

    def test_unknown_customer_is_404(self, client):
        error = assert_error(client.get("/customers/999/summary"), 404, "not_found")
        assert "999" in error["message"]

    def test_guest_purchases_never_appear(self, client):
        # The guest's March order must not be attributed to any customer.
        for cid in (100, 200):
            body = client.get(f"/customers/{cid}/summary").json()
            assert body["last_order"] < "2010-03-01"
        assert client.get("/sales/summary").json()["total_revenue"] == 128.0  # but it is in sales

    @pytest.mark.parametrize("cid", ["abc", "0", "-5", "12.5", "null", "100000000"])
    def test_bad_id(self, client, cid):
        error = assert_error(client.get(f"/customers/{cid}/summary"), 400, "invalid_request")
        assert error["details"][0]["field"] == "customer_id"


class TestGeneral:
    def test_health(self, client):
        assert client.get("/health").json() == {"status": "ok", "database": "ok"}

    def test_unknown_path_is_json_404(self, client):
        assert_error(client.get("/does-not-exist"), 404, "not_found")

    def test_api_is_read_only(self, client):
        assert_error(client.post("/sales/summary"), 405, "method_not_allowed")
        assert_error(client.delete("/customers/100/summary"), 405, "method_not_allowed")

    def test_interactive_docs_are_disabled(self, client):
        assert client.get("/docs").status_code == 404
