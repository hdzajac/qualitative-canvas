import React from 'react';
import { Tag, Pencil } from 'lucide-react';

export type SelectionTooltipProps = {
    rect: DOMRect;
    isVtt?: boolean;
    onAddCode: () => void;
    onEditBlocks?: () => void;
};

export const SelectionTooltip: React.FC<SelectionTooltipProps> = ({ rect, isVtt = false, onAddCode, onEditBlocks }) => {
    const top = (() => {
        // Place the tooltip a bit higher above the selection to avoid overlapping highlights
        const above = rect.top - 70; // previously 44
        if (above < 20) return Math.min(window.innerHeight - 48, rect.bottom + 10); // add a touch more spacing when placed below
        return above;
    })();
    const left = rect.left + rect.width / 2;
    return (
        <div
            className="fixed z-50 bg-black text-white text-sm px-3 py-2 rounded-md shadow-lg flex items-center gap-4"
            style={{ top, left, transform: 'translateX(-50%)', maxWidth: '90vw' }}
            // Keep selection intact while clicking
            onMouseDown={(e) => e.preventDefault()}
        >
            <button
                type="button"
                className="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                onClick={onAddCode}
                aria-label="Add code from selection"
            >
                <Tag className="w-4 h-4" />
                Add code
            </button>
            {isVtt && onEditBlocks && (
                <>
                    <span className="opacity-50">|</span>
                    <button
                        type="button"
                        className="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        onClick={onEditBlocks}
                        aria-label="Edit selected block(s)"
                    >
                        <Pencil className="w-4 h-4" />
                        Edit block(s)
                    </button>
                </>
            )}
        </div>
    );
};

export default SelectionTooltip;
