import { useState, useRef, useEffect } from 'react';
import { Play, Undo2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';

export interface TranscriptSegmentProps {
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    participantId?: string | null;
    participantName?: string | null;
    isActive: boolean;
    canPlay?: boolean;
    readOnly?: boolean;
    isMarkedForDeletion?: boolean;
    onPlaySegment?: (startMs: number, endMs: number) => void;
    participants?: Array<{ id: string; name: string | null }>;
    onAssignParticipant?: (segmentId: string, participantId: string | null) => void;
    onUpdateText?: (segmentId: string, newText: string) => void;
    onDeleteSegment?: (segmentId: string) => void;
}

function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return `${h}:${mm}:${ss}`;
}

/**
 * A single transcript segment displaying timestamp, optional participant, and text.
 * Highlights text when active (based on currentTimeMs).
 */
export function TranscriptSegment({
    id,
    startMs,
    endMs,
    text,
    participantId,
    participantName,
    isActive,
    canPlay = true,
    readOnly = false,
    isMarkedForDeletion = false,
    onPlaySegment,
    participants,
    onAssignParticipant,
    onUpdateText,
    onDeleteSegment,
}: TranscriptSegmentProps) {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(text);
    const [isSaving, setIsSaving] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const originalTextRef = useRef(text);
    const timeRange = `${formatTime(startMs)} - ${formatTime(endMs)}`;

    // Update original text when prop changes (from optimistic update)
    useEffect(() => {
        if (!isEditing) {
            originalTextRef.current = text;
            setEditedText(text);
        }
    }, [text, isEditing]);

    // Auto-resize textarea and focus when editing starts
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [isEditing]);

    const handlePlay = () => {
        if (onPlaySegment) {
            onPlaySegment(startMs, endMs);
        }
    };

    const handleAssignParticipant = (participantId: string | null) => {
        if (onAssignParticipant) {
            onAssignParticipant(id, participantId);
            setPopoverOpen(false); // Close the popover after selection
        }
    };

    const handleTextClick = () => {
        if (!readOnly && onUpdateText) {
            setIsEditing(true);
        }
    };

    const handleTextChange = (newText: string) => {
        setEditedText(newText);

        // Auto-resize textarea
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Auto-save after 1 second of inactivity
        if (onUpdateText && newText !== originalTextRef.current) {
            setIsSaving(true);
            saveTimeoutRef.current = setTimeout(() => {
                onUpdateText(id, newText);
                originalTextRef.current = newText;
                setIsSaving(false);
            }, 1000);
        }
    };

    const handleBlur = () => {
        // Save immediately on blur if there are pending changes
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            if (onUpdateText && editedText !== originalTextRef.current) {
                onUpdateText(id, editedText);
                originalTextRef.current = editedText;
            }
            setIsSaving(false);
        }
        setIsEditing(false);
    };

    const handleRevert = () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        setEditedText(originalTextRef.current);
        if (onUpdateText && editedText !== originalTextRef.current) {
            onUpdateText(id, originalTextRef.current);
        }
        setIsSaving(false);
        setIsEditing(false);
    };

    const hasChanges = editedText !== originalTextRef.current;

    // Don't render if marked for deletion
    if (isMarkedForDeletion) {
        return null;
    }

    return (
        <div className="relative group py-2" data-segment-id={id}>
            {/* Delete button - shows on hover */}
            {!readOnly && onDeleteSegment && (
                <button
                    type="button"
                    className="absolute -left-10 top-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-700 hover:text-red-700 bg-white border-2 border-black rounded-md px-2 py-1 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                    aria-label="Delete segment (Cmd+Z to undo)"
                    title="Delete segment (Cmd+Z to undo)"
                    onClick={() => onDeleteSegment(id)}
                >
                    <span className="flex items-center gap-1">
                        <Trash2 className="w-4 h-4" />
                        <span className="text-[10px] font-medium text-neutral-500">⌘Z</span>
                    </span>
                </button>
            )}
            
            {/* Timestamp */}
            <div className="flex items-start gap-2 mb-1">
                <time className="text-[11px] text-neutral-400" aria-label={`From ${formatTime(startMs)} to ${formatTime(endMs)}`}>
                    [{timeRange}]
                </time>

                {/* Play button */}
                <button
                    type="button"
                    className={`inline-flex items-center justify-center w-6 h-6 border-2 border-black rounded-md transition-colors ${isActive ? 'bg-black text-white' : 'bg-white hover:bg-neutral-50'
                        }`}
                    aria-label="Play segment"
                    title="Play segment"
                    disabled={!canPlay}
                    onClick={handlePlay}
                >
                    <Play className="w-3 h-3" />
                </button>

                {/* Participant label with optional assignment */}
                {participantName && (
                    <>
                        {readOnly && participants && participants.length > 0 && onAssignParticipant ? (
                            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex items-center text-[12px] font-medium text-neutral-800 border border-black rounded-full px-2 py-0.5 hover:bg-neutral-50"
                                    >
                                        {participantName}:
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[200px]" align="start">
                                    <Command>
                                        <CommandInput placeholder="Assign participant..." />
                                        <CommandEmpty>No participants found.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                onSelect={() => handleAssignParticipant(null)}
                                                className="cursor-pointer"
                                            >
                                                (none)
                                            </CommandItem>
                                            {participants.map((p) => (
                                                <CommandItem
                                                    key={p.id}
                                                    onSelect={() => handleAssignParticipant(p.id)}
                                                    className="cursor-pointer"
                                                >
                                                    {p.name || 'Unnamed'}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        ) : (
                            <span className="inline-flex items-center text-[12px] font-medium text-neutral-800 border border-black rounded-full px-2 py-0.5">
                                {participantName}:
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* Text content - highlighted when active, editable when clicked */}
            <div className="relative">
                {isEditing ? (
                    <div className="space-y-1">
                        <textarea
                            ref={textareaRef}
                            value={editedText}
                            onChange={(e) => handleTextChange(e.target.value)}
                            onBlur={handleBlur}
                            className={`w-full text-sm leading-snug text-neutral-800 border-2 border-indigo-500 rounded px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isActive ? 'bg-indigo-50' : 'bg-white'
                                }`}
                            rows={1}
                        />
                        <div className="flex items-center gap-2 text-xs">
                            {isSaving && <span className="text-neutral-500">Saving...</span>}
                            {!isSaving && hasChanges && <span className="text-neutral-500">Saved</span>}
                            {hasChanges && (
                                <button
                                    type="button"
                                    onClick={handleRevert}
                                    className="inline-flex items-center gap-1 text-neutral-600 hover:text-neutral-800"
                                    title="Revert changes"
                                >
                                    <Undo2 className="w-3 h-3" />
                                    Revert
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <p
                        onClick={handleTextClick}
                        className={`text-sm leading-snug text-neutral-800 transition-colors ${isActive ? 'bg-indigo-50' : ''
                            } ${!readOnly && onUpdateText ? 'cursor-text hover:bg-neutral-50 rounded px-1 -mx-1' : ''}`}
                    >
                        {editedText}
                    </p>
                )}
            </div>
        </div>
    );
}
