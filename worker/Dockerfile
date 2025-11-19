FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AUTO_DIARIZATION_ASSIGN=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download diarization model during build
# This requires a HF token at build time, but results in faster container startup
ARG HUGGING_FACE_HUB_TOKEN
RUN --mount=type=secret,id=HUGGING_FACE_HUB_TOKEN \
    if [ -f /run/secrets/HUGGING_FACE_HUB_TOKEN ]; then \
        export HF_TOKEN=$(cat /run/secrets/HUGGING_FACE_HUB_TOKEN); \
    else \
        export HF_TOKEN="$HUGGING_FACE_HUB_TOKEN"; \
    fi && \
    if [ -n "$HF_TOKEN" ]; then \
        echo "Downloading diarization model with token..." && \
        python -c "from pyannote.audio import Pipeline; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token='$HF_TOKEN')" && \
        echo "Model downloaded successfully!"; \
    else \
        echo "No HF token provided - model will be downloaded at runtime"; \
    fi

COPY . .

CMD ["python", "main.py"]
