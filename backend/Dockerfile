FROM python:3.11-slim

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    curl \
    jq \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir wheel uWSGI && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Tornar entrypoint executável
RUN chmod +x entrypoint.sh

EXPOSE 8001

ENTRYPOINT ["./entrypoint.sh"]

CMD ["uwsgi", "--http", "0.0.0.0:8001", "--module", "stratasec.wsgi", "--env", "DJANGO_SETTINGS_MODULE=stratasec.settings", "--reload-mercy=1", "--worker-reload-mercy=1", "--req-logger", "file:/dev/null", "--touch-reload", "./stratasec/settings.py"]
