import { finalizeTranscript, getFinalized } from '../dao/transcriptsDao.js';

export default function transcriptsService(pool) {
  return {
    getFinalized: (mediaFileId) => getFinalized(pool, mediaFileId),
    finalize: (mediaFileId) => finalizeTranscript(pool, mediaFileId),
  };
}
