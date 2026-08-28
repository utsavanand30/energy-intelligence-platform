# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Install deps first (better layer cache)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Build production bundle → /build/frontend/dist
COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Python backend  +  built frontend static files
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS backend

# libpq-dev  → psycopg2 SSL support (needed for Neon.tech)
# gcc        → some numpy/pandas C extensions
# curl       → healthcheck probing
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        gcc \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Application code
COPY backend/ ./

# Startup script (sits at repo root)
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Built React app → /app/frontend/dist  (path main.py expects)
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Non-root user
RUN addgroup --system appgroup \
 && adduser  --system --ingroup appgroup appuser \
 && chown -R appuser:appgroup /app
USER appuser

# PORT is injected by Koyeb/Render at runtime; default to 8000 locally
ENV PORT=8000
EXPOSE 8000

# start.sh: seeds DB if empty, then starts uvicorn on $PORT
CMD ["sh", "/app/start.sh"]
