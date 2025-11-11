export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  content: string;
  createdAt: string;
  projectId?: string;
}

export interface Size { w: number; h: number }
export interface CardStyle { fontSize?: number; background?: string }

export interface Code { // was Highlight
  id: string;
  fileId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  codeName: string;
  createdAt: string;
  position?: { x: number; y: number };
  size?: Size;
  style?: CardStyle;
}

export type Highlight = Code; // backward compat alias

export interface Theme {
  id: string;
  name: string;
  highlightIds: string[]; // keep name for UI compat; backend maps to code_ids
  createdAt: string;
  position?: { x: number; y: number };
  size?: Size;
  style?: CardStyle;
}

export interface Insight {
  id: string;
  name: string;
  themeIds: string[];
  createdAt: string;
  position?: { x: number; y: number };
  expanded?: boolean;
  size?: Size;
  style?: CardStyle;
}

export interface Annotation {
  id: string;
  content: string;
  position: { x: number; y: number };
  createdAt: string;
  projectId?: string;
  size?: Size;
  style?: CardStyle;
}

// Media & transcription
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

export interface TranscriptSegment {
  id: string;
  mediaFileId: string;
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
  participantId?: string | null;
  participantName?: string;
  createdAt: string;
}

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
  // Progress tracking (optional fields populated when worker PATCHes progress)
  processedMs?: number; // milliseconds processed so far
  totalMs?: number;     // total media duration in milliseconds if known
  etaSeconds?: number;  // estimated seconds remaining (heuristic)
  updatedAt?: string;   // last progress update timestamp
}
