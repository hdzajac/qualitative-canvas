import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createHighlight } from '@/services/api';
import { toast } from 'sonner';
import { TranscriptSegment, TranscriptSegmentProps } from './TranscriptSegment';
import { Card } from '@/components/ui/card';
import SelectionTooltip from '@/components/text/SelectionTooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface TranscriptSegmentData {
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    participantId?: string | null;
    participantName?: string | null;
}

export interface TranscriptViewerProps {
    fileId: string;
    segments: TranscriptSegmentData[];
    currentTimeMs?: number | null;
    canPlay?: boolean;
    readOnly?: boolean;
    framed?: boolean;
    rightPanel?: React.ReactNode; // Optional side panel for codes/highlights
    containerRef?: React.RefObject<HTMLDivElement>; // Ref to the container for positioning codes
    highlightedSegments?: Set<string>; // Set of segment IDs that have codes
    onPlaySegment?: (startMs: number, endMs: number) => void;
    participants?: Array<{ id: string; name: string | null }>;
    onAssignParticipant?: (segmentId: string, participantId: string | null) => void;
    onUpdateSegmentText?: (segmentId: string, newText: string) => void;
    onDeleteSegment?: (segmentId: string) => void;
    deletedSegmentIds?: Set<string>;
    autoScrollEnabled?: boolean;
    autoScrollMode?: 'center' | 'pin';
    onHighlightCreated?: () => void; // Callback when a new code/highlight is created
}

/**
 * Clean, structured transcript viewer that renders segments as components.
 * Each segment determines if it's active based on currentTimeMs.
 */
export function TranscriptViewer({
    fileId,
    segments,
    currentTimeMs,
    canPlay = true,
    readOnly = false,
    framed = true,
    rightPanel,
    containerRef: externalContainerRef,
    highlightedSegments,
    onPlaySegment,
    participants,
    onAssignParticipant,
    onUpdateSegmentText,
    onDeleteSegment,
    deletedSegmentIds,
    onHighlightCreated,
    autoScrollEnabled = true,
    autoScrollMode = 'pin',
}: TranscriptViewerProps) {
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = externalContainerRef || internalContainerRef;
    const activeSegmentRef = useRef<HTMLDivElement | null>(null);

    // Multi-segment selection state
    const [selectionInfo, setSelectionInfo] = useState<{
        startIdx: number;
        endIdx: number;
        text: string;
        rect: DOMRect | null;
    } | null>(null);
    const [codeName, setCodeName] = useState('');
    const [sheetOpen, setSheetOpen] = useState(false);
    const [frozenMultiSelection, setFrozenMultiSelection] = useState<typeof selectionInfo>(null);

    // Multi-segment code creation handler
    const handleMultiSegmentAddCode = useCallback(() => {
        if (!selectionInfo || !selectionInfo.text.trim()) return;
        // Freeze the selection so it persists after clicking
        setFrozenMultiSelection(selectionInfo);
        setSheetOpen(true);
    }, [selectionInfo]);

    // Actually create the code/highlight for multi-segment selection
    const handleCreateMultiSegmentCode = async () => {
        const activeSelection = frozenMultiSelection || selectionInfo;
        if (!activeSelection || !codeName.trim()) return;
        try {
            // Calculate character offsets based on segment positions in the concatenated transcript
            let startOffset = 0;
            let endOffset = 0;
            let currentOffset = 0;

            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const prefix = seg.participantName ? `${seg.participantName}: ` : '';
                const fullText = prefix + seg.text + '\n';

                if (i === activeSelection.startIdx) {
                    startOffset = currentOffset; // Start of the first selected segment
                }
                if (i === activeSelection.endIdx) {
                    endOffset = currentOffset + fullText.length - 1; // End of the last selected segment (excluding newline)
                    break;
                }
                currentOffset += fullText.length;
            }

            await createHighlight({
                fileId,
                startOffset,
                endOffset,
                text: activeSelection.text,
                codeName: codeName.trim(),
                size: { w: 100, h: 40 },
            });
            toast.success('Code created for selected segments');
            setSheetOpen(false);
            setCodeName('');
            setSelectionInfo(null);
            setFrozenMultiSelection(null);

            // Trigger refresh in parent
            if (onHighlightCreated) {
                onHighlightCreated();
            }
        } catch (e) {
            toast.error('Failed to create code');
            console.error(e);
        }
    };

    // Helper: get segment index by node
    const getSegmentIndexFromNode = useCallback((node: Node) => {
        if (!containerRef.current) return -1;
        const segmentNodes = Array.from(containerRef.current.querySelectorAll('[data-segment-id]'));
        const found = segmentNodes.findIndex((el) => el.contains(node));
        return found;
    }, [containerRef]);

    // Selection handler for multi-segment selection
    const handleSelectionChange = useCallback(() => {
        if (!containerRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            setSelectionInfo(null);
            return;
        }
        const range = sel.getRangeAt(0);
        // Only consider selection inside the transcript container
        if (!containerRef.current.contains(range.commonAncestorContainer)) {
            setSelectionInfo(null);
            return;
        }
        // Find start and end segment indices
        const startIdx = getSegmentIndexFromNode(range.startContainer);
        const endIdx = getSegmentIndexFromNode(range.endContainer);
        if (startIdx === -1 || endIdx === -1) {
            setSelectionInfo(null);
            return;
        }
        const [from, to] = [startIdx, endIdx].sort((a, b) => a - b);

        // Only handle multi-segment selections (from !== to)
        // Single-segment selections are handled by TranscriptSegment
        if (from === to) {
            setSelectionInfo(null);
            return;
        }

        // Aggregate selected text with participant names
        let text = '';
        for (let i = from; i <= to; i++) {
            const seg = segments[i];
            const prefix = seg.participantName ? `${seg.participantName}: ` : '';
            text += prefix + seg.text + (i < to ? '\n' : '');
        }
        // Get bounding rect for tooltip
        const rect = range.getBoundingClientRect();
        setSelectionInfo({ startIdx: from, endIdx: to, text, rect });
    }, [segments, getSegmentIndexFromNode, containerRef]); useEffect(() => {
        // Don't track selection changes when sheet is open (frozen selection mode)
        if (sheetOpen) return;
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [handleSelectionChange, sheetOpen]);

    // Keyboard shortcut for multi-segment selection
    useEffect(() => {
        if (!selectionInfo || sheetOpen || readOnly) return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            // Don't trigger if typing in an input/textarea
            if (target && (target.closest('input, textarea, [contenteditable="true"]'))) return;
            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                handleMultiSegmentAddCode();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [selectionInfo, sheetOpen, readOnly, handleMultiSegmentAddCode]);

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
    }, [activeSegmentId, autoScrollEnabled, autoScrollMode, containerRef]);

    const content = (
        <>
            <div className={rightPanel ? "flex gap-6" : ""}>
                <div className="flex-1" ref={containerRef}>
                    <div
                        className="space-y-1 -ml-12 pl-12"
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
                                    fileId={fileId}
                                    startMs={segment.startMs}
                                    endMs={segment.endMs}
                                    text={segment.text}
                                    participantId={segment.participantId}
                                    participantName={segment.participantName}
                                    isActive={segment.id === activeSegmentId}
                                    isMarkedForDeletion={deletedSegmentIds?.has(segment.id)}
                                    isHighlighted={highlightedSegments?.has(segment.id)}
                                    canPlay={canPlay}
                                    readOnly={readOnly}
                                    disableSelectionActions={!!selectionInfo}
                                    onPlaySegment={onPlaySegment}
                                    participants={participants}
                                    onAssignParticipant={onAssignParticipant}
                                    onUpdateText={onUpdateSegmentText}
                                    onDeleteSegment={onDeleteSegment}
                                />
                            ))
                        )}
                    </div>
                </div>
                {rightPanel && (
                    <div className="w-[240px] flex-shrink-0 self-start" style={{ maxHeight: 'calc(100vh - 10rem)' }}>
                        <div className="overflow-y-auto">
                            {rightPanel}
                        </div>
                    </div>
                )}
            </div>

            {/* Multi-segment selection tooltip */}
            {selectionInfo && selectionInfo.text && selectionInfo.rect && !sheetOpen && (
                <SelectionTooltip
                    rect={selectionInfo.rect}
                    isVtt={false}
                    onAddCode={handleMultiSegmentAddCode}
                />
            )}

            {/* Sheet for entering code name for multi-segment selection */}
            <Sheet open={sheetOpen} onOpenChange={(open) => {
                setSheetOpen(open);
                if (!open) {
                    setFrozenMultiSelection(null);
                    setCodeName('');
                }
            }}>
                <SheetContent side="right" className="rounded-none border-l-4 border-black sm:max-w-sm">
                    <SheetHeader>
                        <SheetTitle className="uppercase tracking-wide">Add Code</SheetTitle>
                    </SheetHeader>
                    {(frozenMultiSelection || selectionInfo) && (
                        <div className="space-y-3 mt-4">
                            <div>
                                <Label className="text-sm font-medium">Selected Text</Label>
                                <p className="text-sm text-muted-foreground italic mt-1">"{(frozenMultiSelection || selectionInfo)!.text}"</p>
                            </div>
                            <div>
                                <Label htmlFor="codeName">Code Name</Label>
                                <Input
                                    id="codeName"
                                    value={codeName}
                                    onChange={e => setCodeName(e.target.value)}
                                    placeholder="Enter a code name for this highlight"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleCreateMultiSegmentCode();
                                    }}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleCreateMultiSegmentCode} className="brutal-button">Create Code</Button>
                                <Button variant="outline" onClick={() => { setSheetOpen(false); setCodeName(''); }}>Cancel</Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </>
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
