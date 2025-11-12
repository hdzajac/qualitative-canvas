import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type AudioContextValue = {
    src: string | null;
    setSrc: (url: string | null) => void;
    isReady: boolean;
    isPlaying: boolean;
    durationMs: number | null;
    currentTimeMs: number | null;
    play: () => void;
    pause: () => void;
    seekMs: (ms: number) => void;
    playSegment: (startMs: number, endMs?: number | null) => void;
};

const Ctx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [src, setSrcState] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [durationMs, setDurationMs] = useState<number | null>(null);
    const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(null);
    const segmentEndRef = useRef<number | null>(null);
    // Lazily create the audio element once on client
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const el = new Audio();
        el.preload = 'auto';
        // Avoid requiring CORS unless needed; allow same-origin or proxy URLs to play.
        audioRef.current = el;
        const onLoaded = () => { setIsReady(true); setDurationMs(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null); };
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTime = () => {
            const t = Math.round(el.currentTime * 1000);
            setCurrentTimeMs(t);
        };
        const onEnded = () => { setIsPlaying(false); segmentEndRef.current = null; };
        el.addEventListener('loadedmetadata', onLoaded);
        el.addEventListener('play', onPlay);
        el.addEventListener('pause', onPause);
        el.addEventListener('timeupdate', onTime);
        el.addEventListener('ended', onEnded);
        return () => {
            el.pause();
            el.removeEventListener('loadedmetadata', onLoaded);
            el.removeEventListener('play', onPlay);
            el.removeEventListener('pause', onPause);
            el.removeEventListener('timeupdate', onTime);
            el.removeEventListener('ended', onEnded);
            audioRef.current = null;
        };
    }, []);

    const setSrc = useCallback((url: string | null) => {
        setSrcState(url);
        const el = audioRef.current;
        if (!el) return;
        setIsReady(false);
        setDurationMs(null);
        segmentEndRef.current = null;
        if (url) {
            el.src = url;
            el.load();
        } else {
            el.removeAttribute('src');
            try { el.load(); } catch { /* ignore */ }
        }
    }, []);

    const play = useCallback(() => { audioRef.current?.play(); }, []);
    const pause = useCallback(() => { audioRef.current?.pause(); segmentEndRef.current = null; }, []);
    const seekMs = useCallback((ms: number) => {
        const el = audioRef.current; if (!el) return;
        el.currentTime = Math.max(0, ms) / 1000;
    }, []);
    const playSegment = useCallback((startMs: number, endMs?: number | null) => {
        const el = audioRef.current; if (!el) return;
        if (!Number.isFinite(startMs)) return;
        segmentEndRef.current = null; // still ignore end auto-stop
        const targetTime = Math.max(0, startMs) / 1000;
        // If currentTime differs more than 0.25s, force seek (helps with quick successive clicks)
        if (Math.abs(el.currentTime - targetTime) > 0.25) {
            el.currentTime = targetTime;
        }
        // Attempt play; if promise rejects (autoplay policy), catch silently
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => { });
    }, []);

    const value = useMemo<AudioContextValue>(() => ({
        src,
        setSrc,
        isReady,
        isPlaying,
        durationMs,
        currentTimeMs,
        play,
        pause,
        seekMs,
        playSegment,
    }), [src, setSrc, isReady, isPlaying, durationMs, currentTimeMs, play, pause, seekMs, playSegment]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Hook for consuming the audio context
// eslint-disable-next-line react-refresh/only-export-components
export function useAudio() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useAudio must be used within AudioProvider');
    return ctx;
}
