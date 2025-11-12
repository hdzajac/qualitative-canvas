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

export function AudioBar() {
    const { isReady, isPlaying, currentTimeMs, durationMs, play, pause, seekMs } = useAudio();
    const pct = useMemo(() => {
        if (!durationMs || !currentTimeMs) return 0;
        return Math.max(0, Math.min(100, Math.round((currentTimeMs / durationMs) * 100)));
    }, [currentTimeMs, durationMs]);
    return (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-md border-2 border-black px-3 py-2 bg-white shadow-lg backdrop-blur-sm" aria-label="Audio playback controls">
            <Button size="sm" variant="outline" disabled={!isReady} onClick={() => (isPlaying ? pause() : play())}>
                {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <div className="text-xs text-neutral-700 tabular-nums">{fmt(currentTimeMs)} / {fmt(durationMs)}</div>
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
                className="w-40 accent-black"
                aria-label="Seek audio"
            />
        </div>
    );
}

export default AudioBar;
