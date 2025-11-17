import type { Size, CardStyle } from './core';

export interface Insight {
  id: string;
  name: string;
  themeIds: string[];
  projectId?: string;
  createdAt: string;
  position?: { x: number; y: number };
  expanded?: boolean;
  size?: Size;
  style?: CardStyle;
}
