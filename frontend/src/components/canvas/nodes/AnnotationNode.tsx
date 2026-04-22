import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import type { Annotation } from '@/types';

export interface AnnotationNodeData {
  annotation: Annotation;
  onCommit: (id: string, text: string) => void;
}

function AnnotationNode({ data, selected }: NodeProps) {
  const { annotation, onCommit } = data as unknown as AnnotationNodeData;
  const [draft, setDraft] = useState(annotation.content ?? '');
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep draft in sync if annotation content changes externally
  useEffect(() => {
    if (!editing) setDraft(annotation.content ?? '');
  }, [annotation.content, editing]);

  const handleDoubleClick = useCallback(() => {
    setEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleBlur = useCallback(() => {
    setEditing(false);
    onCommit(annotation.id, draft);
  }, [annotation.id, draft, onCommit]);

  const bg = annotation.style?.background ?? '#FEF3C7';
  const fontSize = annotation.style?.fontSize ?? 13;

  return (
    <>
      <NodeResizer
        minWidth={60}
        minHeight={24}
        isVisible={selected}
        lineClassName="border-gray-400"
        handleClassName="w-2 h-2 bg-white border border-gray-400"
      />
      <div
        className="w-full h-full overflow-hidden"
        style={{
          background: bg,
          border: selected ? '1.5px solid #6b7280' : '1px solid #d1d5db',
          boxShadow: selected ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.08)',
          fontSize,
        }}
        onDoubleClick={handleDoubleClick}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="w-full h-full resize-none bg-transparent p-2 text-gray-800 focus:outline-none"
            style={{ fontSize }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
          />
        ) : (
          <div className="p-2 text-gray-800 whitespace-pre-wrap break-words select-none cursor-text">
            {draft || <span className="text-gray-400 italic">Double-click to edit</span>}
          </div>
        )}
      </div>
    </>
  );
}

export default memo(AnnotationNode);
