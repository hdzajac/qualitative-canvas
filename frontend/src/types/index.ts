export interface UploadedFile {
  id: string;
  filename: string;
  content: string;
  createdAt: string;
}

export interface Highlight {
  id: string;
  fileId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  codeName: string;
  createdAt: string;
  position?: { x: number; y: number };
}

export interface Theme {
  id: string;
  name: string;
  highlightIds: string[];
  createdAt: string;
  position?: { x: number; y: number };
}

export interface Insight {
  id: string;
  name: string;
  themeIds: string[];
  createdAt: string;
  position?: { x: number; y: number };
  expanded?: boolean;
}

export interface Annotation {
  id: string;
  content: string;
  position: { x: number; y: number };
  createdAt: string;
}
