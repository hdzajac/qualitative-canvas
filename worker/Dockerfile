FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AUTO_DIARIZATION_ASSIGN=1 \
    HF_HUB_OFFLINE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper model during build (no auth needed)
# This downloads the 484MB model.bin file to avoid runtime download delay
RUN echo "Pre-downloading Whisper 'small' model..." && \
    python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')" && \
    echo "Whisper model pre-downloaded successfully!"

# Pre-download diarization model during build (requires HF token ONLY at build time)
# At runtime, HF_HUB_OFFLINE=1 forces use of cached model without internet/token checks
# The secret is mounted as a file at /run/secrets/HUGGING_FACE_HUB_TOKEN
RUN --mount=type=secret,id=HUGGING_FACE_HUB_TOKEN \
    if [ -f /run/secrets/HUGGING_FACE_HUB_TOKEN ]; then \
        echo "HF token secret found - downloading diarization model for offline use..." && \
        export HF_TOKEN=$(cat /run/secrets/HUGGING_FACE_HUB_TOKEN) && \
        unset HF_HUB_OFFLINE && \
        python -c "from pyannote.audio import Pipeline; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token='\$HF_TOKEN')" && \
        echo "Diarization model cached successfully - will work offline at runtime!"; \
    else \
        echo "WARNING: No HF token secret found at /run/secrets/HUGGING_FACE_HUB_TOKEN"; \
        echo "Diarization will NOT work without pre-cached model files."; \
    fi

COPY . .

CMD ["python", "main.py"]
