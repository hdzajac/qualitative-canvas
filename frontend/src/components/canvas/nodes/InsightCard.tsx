import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { Insight } from '@/types';
import ParentCard from './ParentCard';

export interface InsightCardData {
    insight: Insight;
    onOpen: (id: string) => void;
    /** 0–1: injected during drag by the proximity engine in FlowCanvas */
    proximity?: number;
    /** Computed field ring radius in px, passed from FlowCanvas buildNodes */
    fieldRadius?: number;
}

function InsightCard({ data, selected }: NodeProps) {
    const { insight, onOpen, proximity = 0, fieldRadius } = data as unknown as InsightCardData;
    const memberCount = (insight.themeIds ?? []).length;
    return (
        <ParentCard
            id={insight.id}
            label={insight.name ?? 'Untitled'}
            accentColor="#f59e0b"
            accentClass="bg-amber-400"
            memberCount={memberCount}
            fieldRadius={fieldRadius ?? (180 + memberCount * 15)}
            proximity={proximity}
            selected={selected}
            onOpen={onOpen}
            showSourceHandle={false}
        />
    );
}

export default memo(InsightCard);
