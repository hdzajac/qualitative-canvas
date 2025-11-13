/* @vitest-environment happy-dom */
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReactDOM from 'react-dom/client';
import { AudioProvider, useAudio } from '@/hooks/useAudio';

// Minimal mock for HTMLAudioElement used by AudioProvider
class MockAudio implements Partial<HTMLAudioElement> {
    preload: '' | 'none' | 'metadata' | 'auto' = 'auto';
    src = '';
    currentTime = 0;
    duration = Number.NaN; // becomes available after loadedmetadata
    paused = true;
    error: MediaError | null = null;
    crossOrigin: string | null = null;
    // Simulate media readyState
    // 0: HAVE_NOTHING, 1: HAVE_METADATA, 2: HAVE_CURRENT_DATA, 3: HAVE_FUTURE_DATA, 4: HAVE_ENOUGH_DATA
    readyState = 0;
    get currentSrc() { return this.src; }
    // Mock seekable ranges
    seekable = {
        length: 1,
        start: () => 0,
        end: () => this.duration || 0
    } as TimeRanges;
    private listeners: Record<string, Set<EventListener>> = {};

    addEventListener(type: string, listener: EventListener) {
        if (!this.listeners[type]) this.listeners[type] = new Set();
        this.listeners[type].add(listener);
    }
    removeEventListener(type: string, listener: EventListener) {
        this.listeners[type]?.delete(listener);
    }
    dispatch(type: string) {
        if (type === 'loadedmetadata') {
            // metadata becomes available
            this.duration = 120;
            this.readyState = 1;
        }
        if (type === 'canplay') {
            // enough data to begin playback
            this.readyState = 4;
        }
        this.listeners[type]?.forEach((fn) => fn(new Event(type)));
    }

    load() {
        // no-op; tests manually dispatch events
    }
    play(): Promise<void> {
        // Simulate browsers refusing to play when no source is set
        if (!this.src) {
            return Promise.reject(new Error('No src set'));
        }
        globalThis.__audioCalls!.push({ op: 'play', t: this.currentTime });
        this.paused = false;
        this.dispatch('play');
        return Promise.resolve();
    }
    pause() {
        globalThis.__audioCalls!.push({ op: 'pause' });
        this.paused = true;
        this.dispatch('pause');
    }
}

// Test harness to expose hook controls
function Harness() {
    const api = useAudio();
    useEffect(() => { globalThis.__audioApi = api; }, [api]);
    return null;
}

function renderWithProvider() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(<AudioProvider><Harness /></AudioProvider>);
    (container as unknown as { _reactRoot?: typeof root })._reactRoot = root;
    return { root, container };
}

interface PlaybackCall { op: 'play' | 'pause'; t?: number }
declare global {
    var __audioCalls: PlaybackCall[] | undefined;
    var __lastAudio: MockAudio | undefined;
    var __audioApi: ReturnType<typeof useAudio> | undefined;
}

beforeEach(() => {
    globalThis.__audioCalls = [];
    globalThis.__lastAudio = undefined;
    class Patched extends MockAudio {
        constructor() {
            super();
            globalThis.__lastAudio = this;
        }
    }
    // Assign patched constructor
    (globalThis as unknown as { Audio: new () => HTMLAudioElement }).Audio = Patched as unknown as new () => HTMLAudioElement;
});

describe('useAudio playback', () => {
    it('seeks precisely and plays when already ready', async () => {
        const { container } = renderWithProvider();
        const api = await waitForApi();
        await waitForAudio();
        // Set src and simulate metadata
        api.setSrc('test.mp3');
        const el = getMockAudioInstance();
        el.dispatch('loadedmetadata');
        el.dispatch('canplay');

        // Play a segment at 5s
        api.playSegment(5000, null);

        // Wait for setTimeout (10ms) to execute
        await new Promise(resolve => setTimeout(resolve, 20));

        // Dispatch seeked event to trigger play
        el.dispatch('seeked');

        expect(el.currentTime).toBeCloseTo(5, 6);
        expect((globalThis.__audioCalls || []).map(c => c.op)).toContain('play');
        cleanup(container);
    });

    it('queues start and plays at canplay when not ready', async () => {
        const { container } = renderWithProvider();
        const api = await waitForApi();
        await waitForAudio();

        // Set src and dispatch loadedmetadata
        api.setSrc('test2.mp3');
        const el = getMockAudioInstance();
        el.dispatch('loadedmetadata'); // Sets readyState to 1

        // readyState is now 1 (HAVE_METADATA) - not enough to play (need >= 3)
        // Call playSegment - should queue because readyState < 3
        api.playSegment(7000, null);

        // Now make it ready to play by dispatching canplay
        // This will set readyState to 4 AND execute the queued operation
        el.dispatch('canplay');

        // The canplay handler executes pending operations synchronously

        const plays = (globalThis.__audioCalls || []).filter(c => c.op === 'play');
        expect(plays.length).toBeGreaterThan(0);
        const last = plays[plays.length - 1]!;
        expect(last.t).toBeCloseTo(7, 6);
        cleanup(container);
    });
});

// Helpers
function waitForApi(): Promise<ReturnType<typeof useAudio>> {
    return new Promise((resolve) => {
        const check = () => {
            const api = globalThis.__audioApi as ReturnType<typeof useAudio> | undefined;
            if (api) return resolve(api);
            setTimeout(check, 0);
        };
        check();
    });
}

function waitForAudio(): Promise<MockAudio> {
    return new Promise((resolve) => {
        const check = () => {
            const el = globalThis.__lastAudio;
            if (el) return resolve(el);
            setTimeout(check, 0);
        };
        check();
    });
}

function getMockAudioInstance(): MockAudio {
    if (!globalThis.__lastAudio) throw new Error('Audio instance not created yet');
    return globalThis.__lastAudio;
}

function cleanup(container: HTMLElement) {
    // Unmount React tree first
    const root = (container as unknown as { _reactRoot?: ReturnType<typeof ReactDOM.createRoot> })._reactRoot;
    if (root) {
        root.unmount();
    }
    container.remove();
    // Clear globals
    globalThis.__lastAudio = undefined;
    globalThis.__audioApi = undefined;
    globalThis.__audioCalls = [];
}
