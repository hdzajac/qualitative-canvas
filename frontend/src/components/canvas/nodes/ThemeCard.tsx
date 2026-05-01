import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { Theme } from '@/types';
import ParentCard from './ParentCard';

export interface ThemeCardData {
    theme: Theme;
    label?: string;
    onOpen: (id: string) => void;
    /** 0–1: injected during drag by the proximity engine in FlowCanvas */
    proximity?: number;
    /** Computed field ring radius in px, passed from FlowCanvas buildNodes */
    fieldRadius?: number;
    /** Set when a remote peer holds a drag-lock on this node */
    lockedBy?: { userId: string; displayName: string; color: string };
}

function ThemeCard({ data, selected }: NodeProps) {
    const { theme, label, onOpen, proximity = 0, fieldRadius, lockedBy } = data as unknown as ThemeCardData;
    const memberCount = (theme.highlightIds ?? []).length;

    return (
        <ParentCard
            id={theme.id}
            label={theme.name ?? 'Untitled'}
            accentColor="#10b981"
            accentClass="bg-emerald-500"
            memberCount={memberCount}
            fieldRadius={fieldRadius ?? (180 + memberCount * 15)}
            proximity={proximity}
            selected={selected}
            onOpen={onOpen}
            showSourceHandle
            footerLabel={label}
            lockedBy={lockedBy}
        />
    );
}

export default memo(ThemeCard);
