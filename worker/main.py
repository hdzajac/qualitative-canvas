import os
import time
import requests
from dotenv import load_dotenv
from uuid import uuid4

load_dotenv()

BASE_URL = os.getenv('BASE_URL', 'http://localhost:5002/api')
POLL_INTERVAL_SEC = int(os.getenv('POLL_INTERVAL_SEC', '5'))

def lease_job():
    url = f"{BASE_URL}/transcribe-jobs/lease"
    resp = requests.post(url, timeout=15)
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    return resp.json()

def complete_job(job_id):
    url = f"{BASE_URL}/transcribe-jobs/{job_id}/complete"
    resp = requests.post(url, timeout=30)
    resp.raise_for_status()
    return resp.json()

def fetch_media(meta):
    url = f"{BASE_URL}/media/{meta['mediaFileId']}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    media = r.json()
    content_url = f"{BASE_URL}/media/{media['id']}/download"
    data = requests.get(content_url, timeout=60)
    data.raise_for_status()
    return media, data.content.decode(errors='ignore')

def build_fake_segments(text):
    words = text.strip().split()
    chunk_size = int(os.getenv('SIMULATE_WORDS_PER_SEG', '8'))
    segs = []
    idx = 0
    cursor_ms = 0
    per_word_ms = 320  # crude pacing
    while idx < len(words):
        chunk = words[idx: idx + chunk_size]
        start_ms = cursor_ms
        end_ms = start_ms + len(chunk) * per_word_ms
        segs.append({
            'id': str(uuid4()),
            'idx': len(segs),
            'startMs': start_ms,
            'endMs': end_ms,
            'text': ' '.join(chunk)
        })
        cursor_ms = end_ms + 120
        idx += chunk_size
    return segs

def post_segments(media_id, segments):
    url = f"{BASE_URL}/media/{media_id}/segments/bulk"
    payload = { 'segments': segments }
    r = requests.post(url, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

def main():
    print(f"Worker starting. Backend: {BASE_URL}")
    while True:
        try:
            job = lease_job()
            if not job:
                time.sleep(POLL_INTERVAL_SEC)
                continue
            print(f"Leased job {job['id']} for media {job['mediaFileId']}")
            media, content = fetch_media(job)
            print(f"Downloaded media {media['originalFilename']} size={len(content)} bytes")
            segments = build_fake_segments(content or 'Simulated transcription content.')
            posted = post_segments(media['id'], segments)
            print(f"Inserted {posted['count']} segments")
            done = complete_job(job['id'])
            print(f"Marked job {done['id']} complete")
        except requests.RequestException as e:
            print(f"Network error: {e}")
            time.sleep(POLL_INTERVAL_SEC)
        except Exception as e:
            print(f"Unexpected error: {e}")
            time.sleep(POLL_INTERVAL_SEC)

if __name__ == '__main__':
    main()
