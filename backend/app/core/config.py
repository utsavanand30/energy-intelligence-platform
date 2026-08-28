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

    # ── App ─────────────────────────────────────────────────────────────────
    APP_TITLE: str = "Energy Intelligence Platform"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    SCAN_INTERVAL_SECONDS: int = 30

    # Set to "true" in the Docker container so FastAPI serves the React build
    SERVE_FRONTEND: str = "false"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
