// Barrel exports for domain types
export * from './core';
export * from './projects';
export * from './files';
export * from './codes';
export * from './themes';
export * from './insights';
export * from './annotations';
export * from './media';
export * from './segments';
export * from './transcriptionJobs';
export * from './participants';

// Transcript-related shared types
export interface FinalizedTranscriptMapping {
  mediaFileId: string;
  fileId: string;
  finalizedAt: string;
  originalSegmentCount?: number;
}
