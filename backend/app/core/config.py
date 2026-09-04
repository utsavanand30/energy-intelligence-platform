from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # ── Database ────────────────────────────────────────────────────────────
    # Render injects DATABASE_URL automatically for linked PostgreSQL.
    # Koyeb: set manually in the service environment dashboard.
    # Neon.tech: copy the connection string from the Neon console.
    DATABASE_URL: str = "postgresql://energy_user:energy_pass@localhost:5432/energy_db"

    # ── Server ──────────────────────────────────────────────────────────────
    # Koyeb and Render inject PORT at runtime.  start.sh and the CMD both
    # read $PORT so uvicorn always binds to the right port.
    PORT: int = 8000

    # ── Security ────────────────────────────────────────────────────────────
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # ── CORS ────────────────────────────────────────────────────────────────
    # Comma-separated allowed origins.  In production set this to your
    # Koyeb/Render app URL, e.g.:
    #   https://energy-intelligence-platform-xxxx.koyeb.app
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # ── Simulation ──────────────────────────────────────────────────────────
    SIMULATION_MODE: str = "realtime"
    SIMULATION_SPEED: int = 1

    # ── Auth / JWT ───────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "dev-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── SMTP ─────────────────────────────────────────────────────────────────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "EnergyIQ Platform"

    # ── Microsoft Azure AD SSO ───────────────────────────────────────────────
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    AZURE_TENANT_ID: str = ""

    # ── Google SSO ───────────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_WORKSPACE_DOMAIN: str = ""

    # ── App ─────────────────────────────────────────────────────────────────
    APP_TITLE: str = "Energy Intelligence Platform"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    SCAN_INTERVAL_SECONDS: int = 300     # 5 minutes default (was 30s — reduces DB writes 10x)
    DATA_RETENTION_DAYS: int = 30        # delete readings older than this many days

    # Set to "true" in the Docker container so FastAPI serves the React build
    SERVE_FRONTEND: str = "false"

    # Frontend base URL — used to build links in emails and OAuth redirects
    FRONTEND_URL: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
