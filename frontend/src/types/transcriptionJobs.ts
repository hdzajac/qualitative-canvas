export interface TranscriptionJob {
  id: string;
  mediaFileId: string;
  model?: string;
  languageHint?: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
  processedMs?: number;
  totalMs?: number;
  etaSeconds?: number;
  updatedAt?: string;
}
