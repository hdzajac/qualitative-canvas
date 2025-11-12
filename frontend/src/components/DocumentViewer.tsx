import React, { forwardRef, useImperativeHandle } from 'react';
import { TextViewer, TextViewerHandle } from '@/components/TextViewer';
import type { Highlight } from '@/types';

// Extension panel contract: each panel receives the file/transcript context and optional callbacks.
export interface ViewerExtensionProps {
    fileId: string;
    content: string;
    isVtt: boolean;
    // Allow extensions to trigger a refresh of highlights/segments externally
    onRefresh?: () => void;
}

export type DocumentViewerHandle = TextViewerHandle;

export interface DocumentViewerProps {
    fileId: string;
    content: string;
    highlights: Highlight[];
    onHighlightCreated: () => void;
    isVtt?: boolean;
    // Playback controls
    onPlaySegment?: (startMs: number | null, endMs: number | null) => void;
    canPlay?: boolean;
    // Current playback progress for highlighting active segment
    currentTimeMs?: number | null;
    // Auto-scroll controls
    autoScrollEnabled?: boolean;
    autoScrollMode?: 'center' | 'pin';
    // VTT metadata and participant assignment
    vttMeta?: Array<{ segmentId: string; startMs?: number; endMs?: number; participantId?: string | null; participantName?: string | null }>;
    // Allow passing a lightweight participant shape (e.g. from list queries) without full metadata.
    participants?: Array<{ id: string; name: string | null }>;
    onAssignParticipant?: (segmentId: string, participantId: string | null) => Promise<void> | void;
    // Layout slots
    headerExtras?: React.ReactNode;
    leftPanel?: React.ReactNode; // e.g. participants management
    rightPanel?: React.ReactNode; // e.g. codes rail
    footer?: React.ReactNode;
    framed?: boolean;
    // Behavior controls passthrough
    readOnly?: boolean;
    enableSelectionActions?: boolean;
    saveContent?: (next: string) => Promise<void>;
}

// Simple first iteration wrapper: uses a 3-column responsive grid if side panels provided.
export const DocumentViewer = forwardRef<DocumentViewerHandle, DocumentViewerProps>(
    ({ fileId, content, highlights, onHighlightCreated, isVtt = false, headerExtras, leftPanel, rightPanel, footer, framed = true, readOnly = false, enableSelectionActions = true, saveContent, onPlaySegment, canPlay, currentTimeMs, autoScrollEnabled = true, autoScrollMode = 'pin', vttMeta, participants, onAssignParticipant }, ref) => {
        const tvRef = React.useRef<TextViewerHandle>(null);
        useImperativeHandle(ref, () => ({
            scrollToOffset: (o: number) => tvRef.current?.scrollToOffset(o),
            flashAtOffset: (o: number) => tvRef.current?.flashAtOffset(o),
            flashAtRange: (s: number, e: number) => tvRef.current?.flashAtRange(s, e),
            getContainerRect: () => tvRef.current?.getContainerRect() || null,
            getTopForOffset: (o: number) => tvRef.current?.getTopForOffset(o) || null,
        }), []);

        const center = (
            <div id="transcript-container">
                <TextViewer
                    ref={tvRef}
                    fileId={fileId}
                    content={content}
                    highlights={highlights}
                    onHighlightCreated={onHighlightCreated}
                    isVtt={isVtt}
                    framed={framed}
                    readOnly={readOnly}
                    enableSelectionActions={enableSelectionActions}
                    saveContent={saveContent}
                    onPlaySegment={onPlaySegment}
                    canPlay={canPlay}
                    currentTimeMs={currentTimeMs}
                    autoScrollEnabled={autoScrollEnabled}
                    autoScrollMode={autoScrollMode}
                    activeSegmentAutoStop={false}
                    vttMeta={vttMeta}
                    participants={participants}
                    onAssignParticipant={onAssignParticipant}
                />
            </div>
        );

        const hasSidePanels = Boolean(leftPanel || rightPanel);

        return (
            <div className="space-y-4" data-has-side-panels={hasSidePanels}>
                {headerExtras && <div className="flex items-center justify-between">{headerExtras}</div>}
                {hasSidePanels ? (
                    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6 items-start">
                        {leftPanel && <div className="min-w-[220px] space-y-4" aria-label="left-panel">{leftPanel}</div>}
                        <div>{center}</div>
                        {rightPanel && <div className="min-w-[200px] space-y-4" aria-label="right-panel">{rightPanel}</div>}
                    </div>
                ) : (
                    center
                )}
                {footer && <div>{footer}</div>}
            </div>
        );
    }
);

DocumentViewer.displayName = 'DocumentViewer';
