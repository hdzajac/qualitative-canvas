import { Play } from 'lucide-react';
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
    onPlaySegment?: (startMs: number, endMs: number) => void;
    participants?: Array<{ id: string; name: string | null }>;
    onAssignParticipant?: (segmentId: string, participantId: string | null) => void;
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
    onPlaySegment,
    participants,
    onAssignParticipant,
}: TranscriptSegmentProps) {
    const timeRange = `${formatTime(startMs)} - ${formatTime(endMs)}`;

    const handlePlay = () => {
        if (onPlaySegment) {
            onPlaySegment(startMs, endMs);
        }
    };

    return (
        <div className="relative group py-2" data-segment-id={id}>
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
                            <Popover>
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
                                                onSelect={() => onAssignParticipant(id, null)}
                                                className="cursor-pointer"
                                            >
                                                (none)
                                            </CommandItem>
                                            {participants.map((p) => (
                                                <CommandItem
                                                    key={p.id}
                                                    onSelect={() => onAssignParticipant(id, p.id)}
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

            {/* Text content - highlighted when active */}
            <p
                className={`text-sm leading-snug text-neutral-800 transition-colors ${isActive ? 'bg-indigo-50' : ''
                    }`}
            >
                {text}
            </p>
        </div>
    );
}
