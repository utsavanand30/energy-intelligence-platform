import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.core.config import settings


# ── Microsoft Azure AD ────────────────────────────────────────────────────────

def get_microsoft_auth_url(state: str, redirect_uri: str) -> str:
    params = {
        "client_id": settings.AZURE_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": "openid profile email",
        "state": state,
        "response_mode": "query",
    }
    base = f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/authorize"
    return f"{base}?{urlencode(params)}"


async def exchange_microsoft_code(code: str, redirect_uri: str) -> dict:
    token_url = f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/token"
    async with httpx.AsyncClient() as client:
        resp = await client.post(token_url, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": settings.AZURE_CLIENT_ID,
            "client_secret": settings.AZURE_CLIENT_SECRET,
        })
        resp.raise_for_status()
        return resp.json()


async def get_microsoft_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


# ── Google Workspace ──────────────────────────────────────────────────────────

def get_google_auth_url(state: str, redirect_uri: str) -> str:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": "openid profile email",
        "state": state,
        "access_type": "online",
    }
    if settings.GOOGLE_WORKSPACE_DOMAIN:
        params["hd"] = settings.GOOGLE_WORKSPACE_DOMAIN
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


async def exchange_google_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
        })
        resp.raise_for_status()
        return resp.json()


async def get_google_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


# ── Shared helpers ────────────────────────────────────────────────────────────

def generate_sso_username(email: str, existing_usernames: set[str]) -> str:
    """Generate a unique username from email address."""
    base = email.split("@")[0].lower()
    # Replace non-alphanumeric chars with underscores
    import re
    base = re.sub(r"[^a-z0-9_]", "_", base)[:80]
    if base not in existing_usernames:
        return base
    # Append random suffix until unique
    for _ in range(20):
        candidate = f"{base}_{secrets.randbelow(9000) + 1000}"
        if candidate not in existing_usernames:
            return candidate
    return f"{base}_{secrets.token_hex(4)}"
