# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Copy package files first for better layer caching
COPY frontend/package.json frontend/package-lock.json* ./

# Install all dependencies (including devDependencies needed for the build)
RUN npm ci --legacy-peer-deps

# Copy the rest of the frontend source
COPY frontend/ ./

# Build production bundle — output goes to /build/frontend/dist
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Python backend + copied frontend dist
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS backend

# System deps for psycopg2 (libpq) and general build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        gcc \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ ./

# Copy built frontend from stage 1 into the location main.py expects:
#   /app/frontend/dist
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Create non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser

# Expose the port Render maps to
EXPOSE 8000

# Startup: run migrations then start the server
# Using a shell script so we can chain commands cleanly
CMD ["sh", "-c", \
     "python -m app.seed.run_seed && \
      uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
