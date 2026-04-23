/**
 * ParentCard — shared shell for ThemeCard and InsightCard.
 *
 * Owns the hover tracking, flash detection, and FieldAura rendering
 * so those two leaf cards can be thin wrappers.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FieldAura } from './FieldAura';

export interface ParentCardProps {
    id: string;
    label: string;
    accentColor: string;         // '#10b981' | '#f59e0b'
    accentClass: string;         // Tailwind class for the accent strip, e.g. 'bg-emerald-500'
    memberCount: number;
    fieldRadius: number;
    proximity?: number;
    selected: boolean;
    onOpen: (id: string) => void;
    /** Whether to render the source (right) handle */
    showSourceHandle?: boolean;
    /** Slot for extra content below the title */
    children?: React.ReactNode;
    /** Optional sub-label rendered at the bottom */
    footerLabel?: string;
}

function ParentCard({
    id,
    label,
    accentColor,
    accentClass,
    memberCount,
    fieldRadius,
    proximity = 0,
    selected,
    onOpen,
    showSourceHandle = false,
    children,
    footerLabel,
}: ParentCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    // Flash whenever member count changes
    const prevMemberCountRef = useRef(memberCount);
    const [isFlashing, setIsFlashing] = useState(false);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => {
        if (prevMemberCountRef.current !== memberCount) {
            prevMemberCountRef.current = memberCount;
            setIsFlashing(true);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
            flashTimerRef.current = setTimeout(() => setIsFlashing(false), 800);
        }
    });
    useEffect(() => () => clearTimeout(flashTimerRef.current), []);

    const handleOpen = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onOpen(id);
        },
        [id, onOpen]
    );

    return (
        <div
            className="relative bg-white flex overflow-visible"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                width: '100%',
                height: '100%',
                border: selected ? `3px solid ${accentColor}` : '1.5px solid #111827',
                boxShadow: selected
                    ? '0 6px 14px rgba(0,0,0,0.25)'
                    : '0 3px 6px rgba(0,0,0,0.06)',
            }}
        >
            {/* Magnetic field aura — overflows card boundary, pointer-events none */}
            <FieldAura
                proximity={proximity}
                isHovered={isHovered}
                fieldRadius={fieldRadius}
                isFlashing={isFlashing}
                color={accentColor}
            />
            {/* Left accent strip */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentClass}`} />

            {/* Open icon */}
            <button
                className="absolute top-1.5 right-1 text-gray-700 text-xs leading-none focus:outline-none"
                style={{ color: '#6b7280' }}
                onClick={handleOpen}
                aria-label="Open"
            >
                ↗
            </button>

            {/* Title */}
            <div
                className="pl-4 pr-6 pt-2 pb-5 text-gray-900 text-sm leading-snug w-full overflow-hidden"
                style={{ wordBreak: 'break-word' }}
            >
                {label || 'Untitled'}
            </div>

            {/* Extra slot (e.g. badge pills) */}
            {children}

            {/* Footer label */}
            {footerLabel && (
                <div
                    className="absolute bottom-1 left-4 right-2 text-gray-400 overflow-hidden whitespace-nowrap text-ellipsis"
                    style={{ fontSize: 11 }}
                >
                    {footerLabel}
                </div>
            )}

            {/* React Flow handles */}
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
            {showSourceHandle && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-2 !h-2 !rounded-full !bg-white !border !opacity-0 hover:!opacity-100 transition-opacity"
                    style={{ right: -5, borderColor: accentColor }}
                />
            )}
        </div>
    );
}

export default memo(ParentCard);
