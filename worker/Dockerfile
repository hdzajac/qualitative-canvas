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
RUN if [ -n "$HUGGING_FACE_HUB_TOKEN" ]; then \
        python -c "from pyannote.audio import Pipeline; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token='$HUGGING_FACE_HUB_TOKEN')"; \
    fi

COPY . .

CMD ["python", "main.py"]
