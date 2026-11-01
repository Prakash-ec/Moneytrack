FROM python:3.11-slim

# Prevent python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies (including tesseract for receipt OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Copy backend application code
COPY . .

# Set default environment variables
ENV PORT=8000
ENV DATABASE_URL=sqlite:////app/data/moneytrack.db
ENV CORS_ORIGINS=*
ENV SERVE_FRONTEND=false

EXPOSE 8000

# Health check to ensure API is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start uvicorn with host 0.0.0.0 and dynamic port binding
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
