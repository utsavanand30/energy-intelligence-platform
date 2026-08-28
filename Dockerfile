# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build React frontend
# Optimised for Railway: uses npm install (not npm ci) to avoid lock
# file version conflicts, and sets NODE_OPTIONS for low-memory builds.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Increase Node heap size for Railway's build container (512 MB limit)
ENV NODE_OPTIONS="--max-old-space-size=460"

COPY frontend/package.json ./
# Use install (not ci) — more forgiving of lock file differences
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Python backend + built frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS backend

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        gcc \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python packages
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# App source
COPY backend/ ./

# Startup script
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# React build output
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Non-root user
RUN addgroup --system appgroup \
 && adduser  --system --ingroup appgroup appuser \
 && chown -R appuser:appgroup /app
USER appuser

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "/app/start.sh"]
