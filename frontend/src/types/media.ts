export interface MediaFile {
  id: string;
  projectId?: string;
  originalFilename: string;
  mimeType?: string;
  storagePath: string;
  sizeBytes?: number;
  durationSec?: number;
  status: 'uploaded' | 'processing' | 'done' | 'error';
  errorMessage?: string;
  createdAt: string;
}
