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

# Pre-download Whisper model during build (no auth needed)
# This downloads the 484MB model.bin file to avoid runtime download delay
# Temporarily unset HF_HUB_OFFLINE to allow download during build
RUN echo "Pre-downloading Whisper 'small' model..." && \
    unset HF_HUB_OFFLINE && \
    python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')" && \
    echo "Whisper model pre-downloaded successfully!"

# Pre-download diarization model during build (production builds with secrets)
# At runtime, will try cache first, then download if HUGGING_FACE_HUB_TOKEN is provided
# The secret is mounted as a file at /run/secrets/HUGGING_FACE_HUB_TOKEN
RUN --mount=type=secret,id=HUGGING_FACE_HUB_TOKEN \
    if [ -f /run/secrets/HUGGING_FACE_HUB_TOKEN ]; then \
        echo "HF token secret found - downloading diarization model for offline use..." && \
        unset HF_HUB_OFFLINE && \
        python -c "import sys; from pyannote.audio import Pipeline; token=open('/run/secrets/HUGGING_FACE_HUB_TOKEN').read().strip(); Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token=token)" && \
        echo "Diarization model cached successfully - will work offline at runtime!"; \
    else \
        echo "NOTE: No HF token secret found - model will be downloaded at runtime if HUGGING_FACE_HUB_TOKEN is provided"; \
        echo "This is normal for local development. Production builds should pass the secret."; \
    fi

COPY . .

CMD ["python", "main.py"]
