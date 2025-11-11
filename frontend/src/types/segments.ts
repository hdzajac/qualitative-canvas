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
