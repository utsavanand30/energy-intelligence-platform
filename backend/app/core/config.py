from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database — Render injects DATABASE_URL automatically for linked PostgreSQL
    DATABASE_URL: str = "postgresql://energy_user:energy_pass@localhost:5432/energy_db"

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # CORS — comma-separated list of allowed origins
    # In production this is set to the Render service URL
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Simulation
    SIMULATION_MODE: str = "realtime"
    SIMULATION_SPEED: int = 1

    # App
    APP_TITLE: str = "Energy Intelligence Platform"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    # Scan interval (seconds)
    SCAN_INTERVAL_SECONDS: int = 30

    # Set to "true" in production Docker image so FastAPI serves the built React app
    SERVE_FRONTEND: str = "false"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
