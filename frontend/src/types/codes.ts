import type { Size, CardStyle } from './core';

export interface Code { // was Highlight
  id: string;
  fileId: string;
  fileName?: string; // The name of the document or transcript
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
