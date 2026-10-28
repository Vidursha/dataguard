"""Get real WSO2 tokens for the live security tests.

- user_token(): signs a test user in the same way the browser does. It uses
  Authorization Code + PKCE with the public "Dashboard" client and fills in
  WSO2's own login form (and the consent form the first time).
- agent_token(): client credentials token for the "AI Agent" application.

LOCAL USE ONLY: TLS checks are off because of the self-signed certificate.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
WSO2 = "https://localhost:9443"
REDIRECT_URI = "http://localhost:5173/callback"
ALL_SCOPES = "openid sales:read customer:read"


def settings() -> dict[str, str]:
    values = {k: v or "" for k, v in dotenv_values(ROOT / ".env").items()}
    local = ROOT / "frontend" / ".env.local"
    if local.exists():
        values.update({k: v or "" for k, v in dotenv_values(local).items()})
    return values


def decode_jwt(token: str) -> dict:
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def user_token(username: str, password: str, scope: str = ALL_SCOPES) -> dict:
    """Sign in through the WSO2 login page with Authorization Code + PKCE (S256)."""
    client_id = settings()["VITE_WSO2_CLIENT_ID"]
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)

    with httpx.Client(verify=False, timeout=30) as http:  # fine here: local self-signed cert
        response = http.get(f"{WSO2}/oauth2/authorize", params={
            "response_type": "code", "client_id": client_id, "redirect_uri": REDIRECT_URI, "scope": scope,
            "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
        })
        login_url = response.headers["location"]
        session_key = parse_qs(urlparse(login_url).query)["sessionDataKey"][0]
        response = http.post(f"{WSO2}/commonauth",
                             data={"username": username, "password": password, "sessionDataKey": session_key})

        # Follow the redirects ourselves and stop at our callback URL (nothing runs there during tests).
        for _ in range(10):
            location = response.headers.get("location", "")
            if location.startswith(REDIRECT_URI):
                break
            if response.status_code == 200 and "sessionDataKeyConsent" in response.text:
                consent_key = re.search(r'name="sessionDataKeyConsent"\s+value="([^"]+)"', response.text).group(1)
                response = http.post(f"{WSO2}/oauth2/authorize",
                                     data={"sessionDataKeyConsent": consent_key, "consent": "approve"})
                continue
            if not location:
                raise RuntimeError(f"Sign-in for {username} failed (status {response.status_code}); "
                                   "check the password in .env")
            response = http.get(location if location.startswith("http") else f"{WSO2}{location}")
        else:
            raise RuntimeError("Too many redirects during sign-in")

        params = parse_qs(urlparse(location).query)
        if params.get("state") != [state] or "code" not in params:
            raise RuntimeError(f"Sign-in for {username} did not return a code: {location}")
        token = http.post(f"{WSO2}/oauth2/token", data={
            "grant_type": "authorization_code", "code": params["code"][0], "redirect_uri": REDIRECT_URI,
            "client_id": client_id, "code_verifier": verifier,
        })
        token.raise_for_status()
        return token.json()


def agent_token(scope: str = "sales:read customer:read") -> dict:
    """Client credentials token for the AI Agent application."""
    values = settings()
    with httpx.Client(verify=False, timeout=30) as http:
        response = http.post(f"{WSO2}/oauth2/token",
                             auth=(values["AI_AGENT_CLIENT_ID"], values["AI_AGENT_CLIENT_SECRET"]),
                             data={"grant_type": "client_credentials", "scope": scope})
        response.raise_for_status()
        return response.json()
