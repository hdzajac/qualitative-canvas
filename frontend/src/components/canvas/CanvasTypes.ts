import type { Highlight, Theme, Insight, Annotation, CardStyle } from '@/types';

export type Tool = 'select' | 'hand' | 'text';
export type NodeKind = 'code' | 'theme' | 'insight' | 'annotation';
export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

export type NodeView = {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  highlight?: Highlight;
  theme?: Theme;
  insight?: Insight;
  annotation?: Annotation;
};

export const DEFAULTS = {
  code: { w: 200, h: 60 },
  theme: { w: 200, h: 60 },
  insight: { w: 200, h: 60 },
  annotation: { w: 200, h: 60 },
};

export type { Highlight, Theme, Insight, Annotation, CardStyle };
