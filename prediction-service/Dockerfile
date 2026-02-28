FROM python:3.11-slim

WORKDIR /app

# Dependencias del sistema mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Script principal
COPY main.py .

# Cloud Run ejecuta como non-root
RUN useradd -m appuser && chown -R appuser /app
USER appuser

CMD ["python", "main.py"]