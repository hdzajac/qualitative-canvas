import os
import time
import requests
from dotenv import load_dotenv

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
    resp = requests.post(url, timeout=15)
    resp.raise_for_status()
    return resp.json()

def main():
    print(f"Worker starting. Backend: {BASE_URL}")
    while True:
        try:
            job = lease_job()
            if not job:
                time.sleep(POLL_INTERVAL_SEC)
                continue
            print(f"Leased job {job['id']} for media {job['mediaFileId']} - simulating processing...")
            # Simulate some processing time
            time.sleep(1)
            # Mark complete
            done = complete_job(job['id'])
            print(f"Completed job {done['id']}")
        except requests.RequestException as e:
            print(f"Network error: {e}")
            time.sleep(POLL_INTERVAL_SEC)
        except Exception as e:
            print(f"Unexpected error: {e}")
            time.sleep(POLL_INTERVAL_SEC)

if __name__ == '__main__':
    main()
