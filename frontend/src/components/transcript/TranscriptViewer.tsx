import React, { useRef, useEffect } from 'react';
import { TranscriptSegment, TranscriptSegmentProps } from './TranscriptSegment';
import { Card } from '@/components/ui/card';

export interface TranscriptSegmentData {
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    participantId?: string | null;
    participantName?: string | null;
}

export interface TranscriptViewerProps {
    segments: TranscriptSegmentData[];
    currentTimeMs?: number | null;
    canPlay?: boolean;
    readOnly?: boolean;
    framed?: boolean;
    onPlaySegment?: (startMs: number, endMs: number) => void;
    participants?: Array<{ id: string; name: string | null }>;
    onAssignParticipant?: (segmentId: string, participantId: string | null) => void;
    onUpdateSegmentText?: (segmentId: string, newText: string) => void;
    autoScrollEnabled?: boolean;
    autoScrollMode?: 'center' | 'pin';
}

/**
 * Clean, structured transcript viewer that renders segments as components.
 * Each segment determines if it's active based on currentTimeMs.
 */
export function TranscriptViewer({
    segments,
    currentTimeMs,
    canPlay = true,
    readOnly = false,
    framed = true,
    onPlaySegment,
    participants,
    onAssignParticipant,
    onUpdateSegmentText,
    autoScrollEnabled = true,
    autoScrollMode = 'pin',
}: TranscriptViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeSegmentRef = useRef<HTMLDivElement | null>(null);

    // Find active segment index
    const activeSegmentId = React.useMemo(() => {
        if (currentTimeMs == null) return null;
        const segment = segments.find(
            (s) => currentTimeMs >= s.startMs && currentTimeMs < s.endMs
        );
        return segment?.id || null;
    }, [currentTimeMs, segments]);

    // Auto-scroll to active segment
    useEffect(() => {
        if (!autoScrollEnabled || !activeSegmentId || !containerRef.current) return;

        const activeElement = containerRef.current.querySelector(
            `[data-segment-id="${activeSegmentId}"]`
        ) as HTMLElement;

        if (!activeElement) return;

        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = activeElement.getBoundingClientRect();

        if (autoScrollMode === 'center') {
            // Center the active segment
            const offset = elementRect.top - containerRect.top - containerRect.height / 2 + elementRect.height / 2;
            container.scrollBy({ top: offset, behavior: 'smooth' });
        } else {
            // Pin mode: only scroll if element is not visible
            const isAbove = elementRect.top < containerRect.top;
            const isBelow = elementRect.bottom > containerRect.bottom;

            if (isAbove) {
                container.scrollBy({ top: elementRect.top - containerRect.top - 20, behavior: 'smooth' });
            } else if (isBelow) {
                container.scrollBy({ top: elementRect.bottom - containerRect.bottom + 20, behavior: 'smooth' });
            }
        }
    }, [activeSegmentId, autoScrollEnabled, autoScrollMode]);

    const content = (
        <div
            ref={containerRef}
            className="space-y-1 max-h-[70vh] overflow-y-auto"
            role="document"
            aria-label="Transcript"
        >
            {segments.length === 0 ? (
                <p className="text-sm text-neutral-600">No segments available.</p>
            ) : (
                segments.map((segment) => (
                    <TranscriptSegment
                        key={segment.id}
                        id={segment.id}
                        startMs={segment.startMs}
                        endMs={segment.endMs}
                        text={segment.text}
                        participantId={segment.participantId}
                        participantName={segment.participantName}
                        isActive={segment.id === activeSegmentId}
                        canPlay={canPlay}
                        readOnly={readOnly}
                        onPlaySegment={onPlaySegment}
                        participants={participants}
                        onAssignParticipant={onAssignParticipant}
                        onUpdateText={onUpdateSegmentText}
                    />
                ))
            )}
        </div>
    );

    if (framed) {
        return (
            <Card className="border-2 border-black p-4">
                {content}
            </Card>
        );
    }

    return content;
}
