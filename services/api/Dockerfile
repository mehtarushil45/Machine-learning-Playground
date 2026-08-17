FROM python:3.12-slim

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ── Non-root user ────────────────────────────────────────────────────────────
RUN addgroup --system appgroup \
    && adduser --system --ingroup appgroup appuser

WORKDIR /app

# ── Python dependencies (own layer for cache efficiency) ─────────────────────
COPY services/api/requirements.txt services/api/requirements.txt
RUN pip install --no-cache-dir -r services/api/requirements.txt

# ── Application code & editable monorepo package install ───────────────────
COPY . .
RUN pip install --no-cache-dir --no-build-isolation -e .

WORKDIR /app/services/api

RUN mkdir -p /app/services/api/uploads /app/uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

# ── Health check (curl is installed above) ───────────────────────────────────
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
