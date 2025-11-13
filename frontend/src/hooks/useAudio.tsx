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

const DEBUG = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

/**
 * Audio Provider with proper state management to prevent race conditions
 * 
 * Key improvements:
 * 1. Centralized pending operation queue
 * 2. Proper ready state tracking
 * 3. Deferred operations until audio element is ready
 * 4. Clear logging for debugging
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [src, setSrcState] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [durationMs, setDurationMs] = useState<number | null>(null);
    const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(null);

    // Queue for pending setSrc calls before audio element is ready
    const pendingSrcRef = useRef<string | null | undefined>(undefined);

    // Pending operation to execute when audio becomes ready
    const pendingOperationRef = useRef<{
        type: 'PLAY_SEGMENT' | 'SEEK' | 'PLAY';
        startMs?: number;
        seekToMs?: number;
        shouldPlay?: boolean;
    } | null>(null);

    // Track if we're currently processing an operation to prevent loops
    const isProcessingRef = useRef(false);

    // Track if we're currently seeking to prevent concurrent seeks
    const isSeekingRef = useRef(false);

    /**
     * Initialize audio element and attach event listeners
     */
    useEffect(() => {
        if (DEBUG) console.log('[audio] Initializing AudioProvider');
        if (typeof window === 'undefined') return;

        const el = new Audio();
        el.preload = 'auto';
        el.crossOrigin = 'anonymous'; // Enable CORS for range requests
        audioRef.current = el;
        if (DEBUG) console.log('[audio] Audio element created');

        // Process any pending setSrc call
        if (pendingSrcRef.current !== undefined) {
            const url = pendingSrcRef.current;
            pendingSrcRef.current = undefined;
            if (DEBUG) console.log('[audio] Processing pending setSrc', { url });
            setSrcState(url);

            // Apply the src
            if (url) {
                el.src = url;
                try {
                    el.load();
                } catch (e) {
                    console.error('[audio] load() failed', e);
                }
            }
        }

        // Event: Metadata loaded (duration available)
        const onLoadedMetadata = () => {
            if (DEBUG) console.log('[audio] loadedmetadata', {
                duration: el.duration,
                src: el.currentSrc,
                readyState: el.readyState
            });
            setIsReady(true);
            setDurationMs(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
        };

        // Event: Can play (enough data buffered)
        const onCanPlay = () => {
            if (isProcessingRef.current) {
                if (DEBUG) console.log('[audio] canplay - already processing, skipping');
                return;
            }

            if (DEBUG) console.log('[audio] canplay', {
                readyState: el.readyState,
                hasPendingOp: !!pendingOperationRef.current
            });

            // Execute any pending operation
            const pending = pendingOperationRef.current;
            if (pending) {
                isProcessingRef.current = true;
                pendingOperationRef.current = null;

                if (DEBUG) console.log('[audio] Executing pending operation', pending);

                try {
                    if (pending.type === 'PLAY_SEGMENT' && pending.startMs !== undefined) {
                        const targetSec = Math.max(0, pending.startMs) / 1000;
                        el.currentTime = targetSec;
                        const p = el.play();
                        if (p) p.catch((e) => console.warn('[audio] Play failed:', e));
                    } else if (pending.type === 'SEEK' && pending.seekToMs !== undefined) {
                        const targetSec = Math.max(0, pending.seekToMs) / 1000;
                        el.currentTime = targetSec;
                        if (pending.shouldPlay) {
                            const p = el.play();
                            if (p) p.catch((e) => console.warn('[audio] Play failed:', e));
                        }
                    } else if (pending.type === 'PLAY') {
                        const p = el.play();
                        if (p) p.catch((e) => console.warn('[audio] Play failed:', e));
                    }
                } finally {
                    isProcessingRef.current = false;
                }
            }
        };

        // Event: Playing
        const onPlay = () => {
            if (DEBUG) console.log('[audio] play event');
            setIsPlaying(true);
        };

        // Event: Paused
        const onPause = () => {
            if (DEBUG) console.log('[audio] pause event');
            setIsPlaying(false);
        };

        // Event: Time update
        const onTimeUpdate = () => {
            const t = Math.round(el.currentTime * 1000);
            setCurrentTimeMs(t);
        };

        // Event: Error
        const onError = () => {
            const err = el.error as MediaError | null;
            console.error('[audio] error event', {
                code: err?.code,
                message: err?.message,
                src: el.currentSrc
            });
            setIsReady(false);
        };

        // Event: Ended
        const onEnded = () => {
            if (DEBUG) console.log('[audio] ended event');
            setIsPlaying(false);
        };

        // Attach all event listeners
        el.addEventListener('loadedmetadata', onLoadedMetadata);
        el.addEventListener('canplay', onCanPlay);
        el.addEventListener('play', onPlay);
        el.addEventListener('pause', onPause);
        el.addEventListener('timeupdate', onTimeUpdate);
        el.addEventListener('error', onError);
        el.addEventListener('ended', onEnded);

        // Cleanup on unmount
        return () => {
            if (DEBUG) console.log('[audio] Cleaning up AudioProvider');
            el.pause();
            el.removeEventListener('loadedmetadata', onLoadedMetadata);
            el.removeEventListener('canplay', onCanPlay);
            el.removeEventListener('play', onPlay);
            el.removeEventListener('pause', onPause);
            el.removeEventListener('timeupdate', onTimeUpdate);
            el.removeEventListener('error', onError);
            el.removeEventListener('ended', onEnded);
            audioRef.current = null;
        };
    }, []);

    /**
     * Set audio source URL
     */
    const setSrc = useCallback((url: string | null) => {
        const el = audioRef.current;
        if (DEBUG) console.log('[audio] setSrc', { url, hasElement: !!el });

        // If audio element isn't ready yet, queue this operation
        if (!el) {
            if (DEBUG) console.log('[audio] Queueing setSrc until element is ready');
            pendingSrcRef.current = url;
            setSrcState(url); // Update state immediately for UI
            return;
        }

        setSrcState(url);

        // Reset state
        setIsReady(false);
        setDurationMs(null);
        setCurrentTimeMs(null);
        // Preserve PLAY_SEGMENT operations when loading new audio
        // This allows queuing a play-from-position before the audio is loaded
        const pendingPlaySegment = pendingOperationRef.current?.type === 'PLAY_SEGMENT'
            ? pendingOperationRef.current
            : null;
        pendingOperationRef.current = pendingPlaySegment;
        isProcessingRef.current = false;

        if (url) {
            el.src = url;
            try {
                el.load();
            } catch (e) {
                console.error('[audio] load() failed', e);
            }
        } else {
            el.removeAttribute('src');
            try {
                el.load();
            } catch (e) {
                console.error('[audio] load() failed', e);
            }
        }
    }, []);

    /**
     * Play audio from current position
     */
    const play = useCallback(() => {
        const el = audioRef.current;
        if (DEBUG) console.log('[audio] play()', {
            hasElement: !!el,
            readyState: el?.readyState,
            src: el?.src
        });

        if (!el || !el.src) {
            console.warn('[audio] Cannot play: no element or no src');
            return;
        }

        // Check if ready to play immediately
        const HAVE_FUTURE_DATA = 3;
        if (el.readyState >= HAVE_FUTURE_DATA) {
            const p = el.play();
            if (p) p.catch((e) => console.error('[audio] Play failed:', e));
        } else {
            // Queue play operation
            if (DEBUG) console.log('[audio] Not ready, queueing play operation');
            pendingOperationRef.current = { type: 'PLAY' };
        }
    }, []);

    /**
     * Pause audio
     */
    const pause = useCallback(() => {
        const el = audioRef.current;
        if (DEBUG) console.log('[audio] pause()');

        if (el) {
            el.pause();
        }

        // Clear any pending operations
        pendingOperationRef.current = null;
    }, []);

    /**
     * Seek to specific time in milliseconds
     */
    const seekMs = useCallback((ms: number) => {
        const el = audioRef.current;
        if (DEBUG) console.log('[audio] seekMs', {
            ms,
            hasElement: !!el,
            readyState: el?.readyState
        });

        if (!el || !el.src) {
            console.warn('[audio] Cannot seek: no element or no src');
            return;
        }

        const wasPlaying = !el.paused;
        const targetSec = Math.max(0, ms) / 1000;

        // Check if ready to seek immediately
        const HAVE_METADATA = 1;
        if (el.readyState >= HAVE_METADATA) {
            try {
                el.currentTime = targetSec;
                if (wasPlaying) {
                    const p = el.play();
                    if (p) p.catch((e) => console.warn('[audio] Play after seek failed:', e));
                }
            } catch (e) {
                console.error('[audio] Seek failed:', e);
            }
        } else {
            // Queue seek operation
            if (DEBUG) console.log('[audio] Not ready, queueing seek operation');
            pendingOperationRef.current = {
                type: 'SEEK',
                seekToMs: ms,
                shouldPlay: wasPlaying
            };
        }
    }, []);

    /**
     * Play segment starting from specific time
     */
    const playSegment = useCallback((startMs: number, _endMs?: number | null) => {
        const el = audioRef.current;
        if (DEBUG) console.log('[audio] playSegment', {
            startMs,
            hasElement: !!el,
            readyState: el?.readyState,
            src: el?.src
        });

        if (!Number.isFinite(startMs)) {
            console.warn('[audio] Invalid startMs:', startMs);
            return;
        }

        if (!el) {
            console.warn('[audio] Cannot play segment: no element');
            return;
        }

        // If no src yet, just queue the operation - the caller should set src after
        if (!el.src) {
            if (DEBUG) console.log('[audio] No src yet, queueing play segment operation');
            pendingOperationRef.current = { type: 'PLAY_SEGMENT', startMs };
            return;
        }

        const targetSec = Math.max(0, startMs) / 1000;

        // Check if ready to play immediately
        const HAVE_FUTURE_DATA = 3;
        if (el.readyState >= HAVE_FUTURE_DATA) {
            try {
                // Check if already seeking - if so, queue this operation
                if (isSeekingRef.current) {
                    if (DEBUG) console.log('[audio] Already seeking, queueing play segment operation');
                    pendingOperationRef.current = { type: 'PLAY_SEGMENT', startMs };
                    return;
                }

                isSeekingRef.current = true;

                // Pause first to ensure clean seek
                const wasPlaying = !el.paused;
                if (wasPlaying) {
                    el.pause();
                }

                // Use seeked event to play after seek completes
                const onSeeked = () => {
                    el.removeEventListener('seeked', onSeeked);
                    isSeekingRef.current = false;
                    const p = el.play();
                    if (p) {
                        p.catch((e) => {
                            console.warn('[audio] Segment play failed:', e);
                        });
                    }
                };

                el.addEventListener('seeked', onSeeked);

                // Use setTimeout to ensure pause has taken effect
                setTimeout(() => {
                    // Check if targetSec is within seekable range
                    if (el.seekable.length > 0) {
                        const seekStart = el.seekable.start(0);
                        const seekEnd = el.seekable.end(0);

                        if (targetSec < seekStart || targetSec > seekEnd) {
                            console.warn('[audio] Target', targetSec, 'outside seekable range', seekStart, '-', seekEnd);
                            // Clamp to seekable range
                            const clampedSec = Math.max(seekStart, Math.min(seekEnd, targetSec));
                            el.currentTime = clampedSec;
                        } else {
                            el.currentTime = targetSec;
                        }
                    } else {
                        console.warn('[audio] No seekable ranges available!');
                        el.currentTime = targetSec;
                    }
                }, 10);
            } catch (e) {
                console.error('[audio] playSegment failed:', e);
            }
        } else {
            // Queue play segment operation
            if (DEBUG) console.log('[audio] Not ready, queueing play segment operation');
            pendingOperationRef.current = { type: 'PLAY_SEGMENT', startMs };

            // Try to trigger loading if needed
            const HAVE_METADATA = 1;
            if (el.readyState < HAVE_METADATA) {
                try {
                    el.load();
                } catch (e) {
                    console.error('[audio] load() failed', e);
                }
            }
        }
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

/**
 * Hook to access audio context
 * Must be used within AudioProvider
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAudio() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useAudio must be used within AudioProvider');
    return ctx;
}
