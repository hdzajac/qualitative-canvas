import type { Size, CardStyle } from './core';

export interface Annotation {
  id: string;
  content: string;
  position: { x: number; y: number };
  createdAt: string;
  updatedAt?: string;
  projectId?: string;
  size?: Size;
  style?: CardStyle;
}
