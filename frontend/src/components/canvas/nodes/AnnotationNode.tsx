import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import type { Annotation } from '@/types';

const COLOR_SWATCHES = [
    { bg: '#FEF3C7', label: 'Yellow' },
    { bg: '#DBEAFE', label: 'Blue' },
    { bg: '#D1FAE5', label: 'Green' },
    { bg: '#FCE7F3', label: 'Pink' },
    { bg: '#FFFFFF', label: 'White' },
    { bg: '#F3F4F6', label: 'Gray' },
];

export interface AnnotationNodeData {
    annotation: Annotation;
    onCommit: (id: string, text: string) => void;
    onDelete: (id: string) => void;
    onColorChange: (id: string, color: string) => void;
}

function AnnotationNode({ data, selected }: NodeProps) {
    const { annotation, onCommit, onDelete, onColorChange } = data as unknown as AnnotationNodeData;
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
        <div className="w-full h-full relative">
            {/* Toolbar is now inside node bounds, not absolute -top-8 */}
            {selected && (
                <div
                    className="absolute top-0 left-0 flex items-center gap-1 px-1 py-0.5 bg-white border border-gray-300 shadow-sm rounded z-10 nodrag"
                    style={{ whiteSpace: 'nowrap', transform: 'translateY(-28px)' }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {COLOR_SWATCHES.map((swatch) => (
                        <button
                            key={swatch.bg}
                            title={swatch.label}
                            aria-label={`Set color to ${swatch.label}`}
                            className="w-4 h-4 rounded-sm border border-gray-300 hover:scale-110 transition-transform"
                            style={{ background: swatch.bg }}
                            onClick={() => onColorChange(annotation.id, swatch.bg)}
                        />
                    ))}
                    <div className="w-px h-4 bg-gray-300 mx-0.5" />
                    <button
                        aria-label="Delete note"
                        className="text-gray-500 hover:text-red-500 transition-colors text-xs font-bold leading-none px-0.5"
                        onClick={() => onDelete(annotation.id)}
                    >
                        ×
                    </button>
                </div>
            )}
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
        </div>
    );
}

export default memo(AnnotationNode);
