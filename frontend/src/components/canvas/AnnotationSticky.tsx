import React from 'react';

type StartNode = { x: number; y: number; w: number; h: number };

export interface AnnotationStickyProps {
    id: string;
    x: number; y: number; w: number; h: number; // world coords
    zoom: number;
    offset: { x: number; y: number };
    bg: string;
    fontSizePx: number; // base font size (world; will scale by zoom)
    value: string;
    active: boolean;
    isDragging: boolean;
    isResizing: boolean;
    palette: string[];
    onChange: (id: string, val: string) => void;
    onFocus: (id: string) => void;
    onCommit: (id: string, val: string) => void;
    onApplyColor: (id: string, color: string) => void;
    onApplyFontSize: (id: string, size: number) => void;
    onStartMove: (id: string, clientX: number, clientY: number, startNode: StartNode) => void;
    onStartResize: (id: string, clientX: number, clientY: number, startNode: StartNode) => void;
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const m = hex.replace('#', '');
    const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    if (full.length !== 6) return null;
    const int = parseInt(full, 16);
    if (Number.isNaN(int)) return null;
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};

const darken = (hex: string, amt: number) => {
    const rgb = hexToRgb(hex); if (!rgb) return hex;
    const r = Math.max(0, Math.min(255, Math.round(rgb.r * (1 - amt))));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g * (1 - amt))));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b * (1 - amt))));
    return `rgb(${r}, ${g}, ${b})`;
};

const rgba = (hex: string, a: number) => {
    const rgb = hexToRgb(hex); if (!rgb) return `rgba(0,0,0,${a})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
};

export const AnnotationSticky: React.FC<AnnotationStickyProps> = ({
    id, x, y, w, h, zoom, offset, bg, fontSizePx,
    value, active, isDragging, isResizing, palette,
    onChange, onFocus, onCommit, onApplyColor, onApplyFontSize, onStartMove, onStartResize,
}) => {
    const left = offset.x + x * zoom;
    const top = offset.y + y * zoom;
    const width = Math.max(20, w * zoom);
    const height = Math.max(24, h * zoom);
    const fs = fontSizePx;
    const lineHeightPx = Math.max(12, Math.round(fs * 1.2)) * zoom;
    const swatchSize = Math.max(16, 16 * zoom);
    const dragPad = Math.max(6, 8 * zoom);

    return (
        <div
            className="absolute z-30"
            style={{ left, top, width, height, cursor: isResizing ? 'nwse-resize' : (isDragging ? 'grabbing' : 'grab') }}
            onMouseDownCapture={(e) => {
                const target = e.target as HTMLElement;
                if (target && (target.tagName.toLowerCase() === 'textarea' || target.closest('[data-resize="true"]') || target.closest('[data-options="true"]'))) return;
                e.stopPropagation(); e.preventDefault();
                onStartMove(id, (e as unknown as MouseEvent).clientX, (e as unknown as MouseEvent).clientY, { x, y, w, h });
            }}
        >
            {/* Sticky container background */}
            <div
                style={{
                    position: 'absolute', inset: 0, background: bg, borderRadius: 2, zIndex: 1,
                    border: active ? `2px solid ${darken(bg, 0.25)}` : '2px solid transparent',
                    boxShadow: active
                        ? `${`0 0 0 ${Math.max(3, 3 * zoom)}px ` + rgba(bg, 0.35)}, 0 6px 14px rgba(0,0,0,0.15)`
                        : '0 6px 14px rgba(0,0,0,0.15)'
                }}
            />

            {/* Toolbar when active */}
            {active && (
                <div style={{ position: 'absolute', left: '50%', top: -Math.max(36, 36 * zoom), transform: 'translateX(-50%)', display: 'flex', gap: 8, background: 'rgba(255,255,255,0.95)', padding: '4px 8px', borderRadius: 6, boxShadow: '0 4px 10px rgba(0,0,0,0.15)', zIndex: 20 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {palette.map((c) => (
                            <button key={c} onClick={(e) => { e.stopPropagation(); onApplyColor(id, c); }}
                                style={{ width: swatchSize, height: swatchSize, borderRadius: 9999, border: c === bg ? `2px solid ${c}` : '1px solid rgba(0,0,0,0.2)', background: c, cursor: 'pointer' }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {[
                            { label: 'H1', size: 32 },
                            { label: 'H2', size: 24 },
                            { label: 'H3', size: 16 },
                            { label: 'P', size: 12 },
                        ].map(({ label, size }) => (
                            <button key={label} onClick={(e) => { e.stopPropagation(); onApplyFontSize(id, size); }}
                                style={{ minWidth: 28, padding: '2px 6px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer', border: (fs === size) ? '2px solid #000' : '1px solid rgba(0,0,0,0.3)', background: 'white' }}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Textarea */}
            <textarea
                className="outline-none bg-transparent resize-none"
                style={{
                    position: 'absolute',
                    top: dragPad, left: dragPad, right: dragPad, bottom: dragPad,
                    width: `calc(100% - ${dragPad * 2}px)`, height: `calc(100% - ${dragPad * 2}px)`,
                    border: 'none', fontSize: fs * zoom, lineHeight: `${lineHeightPx}px`,
                    padding: Math.max(4, 6 * zoom), color: '#111827', zIndex: 4,
                }}
                autoFocus={active}
                value={value}
                onChange={(e) => onChange(id, e.target.value)}
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') onCommit(id, value);
                    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(id, value); }
                }}
                onBlur={() => onCommit(id, value)}
                onFocus={() => onFocus(id)}
            />

            {/* Resize handle */}
            <div
                title="Resize"
                data-resize="true"
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onStartResize(id, e.clientX, e.clientY, { x, y, w, h }); }}
                style={{
                    position: 'absolute', right: 0, bottom: 0, width: Math.max(14, 14 * zoom), height: Math.max(14, 14 * zoom), cursor: 'nwse-resize', zIndex: 6,
                    background: 'linear-gradient(135deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.25) 50%)'
                }}
            />
        </div>
    );
};

export default React.memo(AnnotationSticky);
