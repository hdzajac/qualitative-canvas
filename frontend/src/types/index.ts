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
