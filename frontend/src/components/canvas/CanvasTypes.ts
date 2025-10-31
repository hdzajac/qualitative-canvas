import type { Highlight as Code, Theme, Insight, Annotation, CardStyle } from '@/types';

export type NodeKind = 'code' | 'theme' | 'insight' | 'annotation';

export interface NodeViewBase {
  id: string;
  x: number; y: number; w: number; h: number;
}
export interface CodeNodeView extends NodeViewBase { kind: 'code'; highlight?: Code }
export interface ThemeNodeView extends NodeViewBase { kind: 'theme'; theme?: Theme }
export interface InsightNodeView extends NodeViewBase { kind: 'insight'; insight?: Insight }
export interface AnnotationNodeView extends NodeViewBase { kind: 'annotation'; annotation?: Annotation }
export type NodeView = CodeNodeView | ThemeNodeView | InsightNodeView | AnnotationNodeView;

export type Tool = 'select' | 'hand' | 'text';
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export const DEFAULTS = {
  code: { w: 200, h: 60 }, // default size for new cards
  theme: { w: 200, h: 60 },
  insight: { w: 200, h: 60 },
  annotation: { w: 160, h: 60 },
};

export type { Highlight as Code, Theme, Insight, Annotation, CardStyle } from '@/types';
