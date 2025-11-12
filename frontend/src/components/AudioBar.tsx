import React, { useMemo } from 'react';
import { useAudio } from '@/hooks/useAudio';
import { Button } from '@/components/ui/button';

function fmt(ms: number | null) {
    if (ms == null) return '0:00:00';
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

export function AudioBar({
    autoScrollEnabled,
    autoScrollMode,
    onToggleAutoScroll,
    onCycleAutoScrollMode,
}: {
    autoScrollEnabled?: boolean;
    autoScrollMode?: 'center' | 'pin';
    onToggleAutoScroll?: () => void;
    onCycleAutoScrollMode?: () => void;
}) {
    const { isReady, isPlaying, currentTimeMs, durationMs, play, pause, seekMs } = useAudio();
    const pct = useMemo(() => {
        if (!durationMs || !currentTimeMs) return 0;
        return Math.max(0, Math.min(100, Math.round((currentTimeMs / durationMs) * 100)));
    }, [currentTimeMs, durationMs]);
    return (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-xl border border-black/70 px-3 py-2 bg-white/90 shadow-[0_3px_0_0_#000] backdrop-blur-sm ring-1 ring-black/10" aria-label="Audio playback controls">
            <Button size="sm" variant="outline" disabled={!isReady} onClick={() => (isPlaying ? pause() : play())}>
                {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <div className="text-[11px] font-mono text-neutral-700 tabular-nums">{fmt(currentTimeMs)} / {fmt(durationMs)}</div>
            <input
                type="range"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!durationMs) return;
                    const next = Math.round((val / 100) * durationMs);
                    seekMs(next);
                }}
                className="w-36 accent-black cursor-pointer"
                aria-label="Seek audio"
            />
            {onToggleAutoScroll && (
                <Button
                    size="sm"
                    variant={autoScrollEnabled ? 'outline' : 'secondary'}
                    onClick={onToggleAutoScroll}
                    className="text-[11px]"
                    aria-label="Toggle auto scroll"
                >
                    {autoScrollEnabled ? 'Auto-scroll' : 'No-scroll'}
                </Button>
            )}
            {onCycleAutoScrollMode && autoScrollEnabled && (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={onCycleAutoScrollMode}
                    className="text-[11px]"
                    aria-label="Change auto scroll mode"
                >
                    {autoScrollMode === 'pin' ? 'Pin' : 'Center'}
                </Button>
            )}
        </div>
    );
}

export default AudioBar;
