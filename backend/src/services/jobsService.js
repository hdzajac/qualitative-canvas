import { v4 as uuidv4 } from 'uuid';
import { createJob, getJob, leaseNextQueuedJob, setJobStatus } from '../dao/jobsDao.js';
import { getMedia, updateMedia } from '../dao/mediaDao.js';

export default function jobsService(pool) {
  return {
    async create(mediaFileId, { model, languageHint } = {}) {
      const media = await getMedia(pool, mediaFileId);
      if (!media) throw new Error('Media not found');
      const job = await createJob(pool, { id: uuidv4(), mediaFileId, model, languageHint });
      return job;
    },
    get: (id) => getJob(pool, id),
    async leaseOne() {
      const job = await leaseNextQueuedJob(pool);
      if (job) {
        // Mark media as processing
        await updateMedia(pool, job.mediaFileId, { status: 'processing' });
      }
      return job;
    },
    async complete(jobId) {
      const job = await setJobStatus(pool, jobId, { status: 'done', setCompleted: true });
      if (job) await updateMedia(pool, job.mediaFileId, { status: 'done' });
      return job;
    },
    async fail(jobId, errorMessage) {
      const job = await setJobStatus(pool, jobId, { status: 'error', errorMessage, setCompleted: true });
      if (job) await updateMedia(pool, job.mediaFileId, { status: 'error', errorMessage });
      return job;
    },
  };
}
