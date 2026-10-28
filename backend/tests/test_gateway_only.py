"""The backend must refuse anything that did not come through the WSO2 gateway."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.app import config
from backend.app.config import GATEWAY_SECRET_HEADER, Settings, load_settings
from backend.app.main import build_openapi, create_app

from .conftest import SECRET

PROTECTED = ["/sales/summary", "/sales/monthly", "/sales/by-country", "/products/top", "/customers/100/summary",
             "/openapi.json"]


@pytest.mark.parametrize("path", PROTECTED)
def test_direct_call_without_secret_is_rejected(raw_client, path):
    response = raw_client.get(path)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "gateway_required"


@pytest.mark.parametrize("value", ["", "wrong", SECRET[:-1], SECRET + "x", SECRET.upper()])
def test_wrong_secret_is_rejected(raw_client, value):
    response = raw_client.get("/sales/summary", headers={GATEWAY_SECRET_HEADER: value})
    assert response.status_code == 403


def test_secret_in_another_header_is_rejected(raw_client):
    assert raw_client.get("/sales/summary", headers={"Authorization": f"Bearer {SECRET}"}).status_code == 403


def test_bad_parameters_without_secret_still_403(raw_client):
    # The gateway check runs before validation, so callers learn nothing about the API.
    assert raw_client.get("/products/top", params={"limit": "999"}).status_code == 403


def test_correct_secret_is_accepted(client):
    assert client.get("/sales/summary").status_code == 200


def test_health_stays_open_for_monitoring(raw_client):
    assert raw_client.get("/health").status_code == 200


def test_missing_secret_prevents_startup(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ROOT", tmp_path)  # no .env file here
    monkeypatch.delenv("GATEWAY_SHARED_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="GATEWAY_SHARED_SECRET"):
        load_settings()


def test_short_secret_prevents_startup(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ROOT", tmp_path)
    monkeypatch.setenv("GATEWAY_SHARED_SECRET", "short")
    with pytest.raises(RuntimeError):
        load_settings()


def test_openapi_export_hides_health(db_path: Path):
    spec = build_openapi(create_app(Settings(database_path=db_path, gateway_secret=SECRET)))
    assert "/health" not in spec["paths"]
    assert set(spec["paths"]) == {"/sales/summary", "/sales/monthly", "/sales/by-country", "/products/top",
                                  "/customers/{customer_id}/summary"}
    for path in spec["paths"].values():
        operation = path["get"]
        assert operation["summary"] and operation["description"] and operation["operationId"]
