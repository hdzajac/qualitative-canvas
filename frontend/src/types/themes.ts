import type { Size, CardStyle } from './core';

export interface Theme {
  id: string;
  name: string;
  highlightIds: string[]; // keep name for UI compat; backend maps to code_ids
  createdAt: string;
  position?: { x: number; y: number };
  size?: Size;
  style?: CardStyle;
}
