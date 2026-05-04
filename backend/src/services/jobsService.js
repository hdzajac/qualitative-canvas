import { v4 as uuidv4 } from 'uuid';
import { createJob, getJob, leaseNextQueuedJob, setJobStatus, setJobProgress, getLatestJobForMedia } from '../dao/jobsDao.js';
import { getMedia, updateMedia } from '../dao/mediaDao.js';

export default function jobsService(pool) {
  return {
    async create(mediaFileId, { model, languageHint, numSpeakers } = {}) {
      const media = await getMedia(pool, mediaFileId);
      if (!media) throw new Error('Media not found');
      const job = await createJob(pool, { id: uuidv4(), mediaFileId, model, languageHint, numSpeakers });
      return job;
    },
    get: (id) => getJob(pool, id),
    getLatestForMedia: (mediaId) => getLatestJobForMedia(pool, mediaId),

    async leaseOne() {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const job = await leaseNextQueuedJob(client);
        if (job) {
          await updateMedia(client, job.mediaFileId, { status: 'processing' });
        }
        await client.query('COMMIT');
        return job;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async complete(jobId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const job = await setJobStatus(client, jobId, { status: 'done', setCompleted: true });
        if (job) {
          await updateMedia(client, job.mediaFileId, { status: 'done' });
        }
        await client.query('COMMIT');
        return job;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async fail(jobId, errorMessage) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const job = await setJobStatus(client, jobId, { status: 'error', errorMessage, setCompleted: true });
        if (job) await updateMedia(client, job.mediaFileId, { status: 'error', errorMessage });
        await client.query('COMMIT');
        return job;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async progress(jobId, { processedMs, totalMs, etaSeconds }) {
      const job = await setJobProgress(pool, jobId, { processedMs, totalMs, etaSeconds });
      return job;
    },
  };
}
