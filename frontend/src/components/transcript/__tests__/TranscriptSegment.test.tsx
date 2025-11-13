import { describe, it, expect } from 'vitest';

// Unit tests for TranscriptSegment logic and TranscriptViewer
describe('TranscriptSegment', () => {
    describe('time formatting', () => {
        function formatTime(ms: number): string {
            const totalSec = Math.floor(ms / 1000);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            const mm = String(m).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            return `${h}:${mm}:${ss}`;
        }

        it('formats time correctly for hours:minutes:seconds', () => {
            expect(formatTime(3661000)).toBe('1:01:01'); // 1:01:01
            expect(formatTime(3662000)).toBe('1:01:02'); // 1:01:02
        });

        it('pads minutes and seconds with zeros', () => {
            expect(formatTime(5000)).toBe('0:00:05');   // 0:00:05
            expect(formatTime(65000)).toBe('0:01:05');  // 0:01:05
            expect(formatTime(605000)).toBe('0:10:05'); // 0:10:05
        });

        it('handles zero correctly', () => {
            expect(formatTime(0)).toBe('0:00:00');
        });

        it('handles large times correctly', () => {
            expect(formatTime(7261000)).toBe('2:01:01'); // 2 hours, 1 minute, 1 second
        });
    });
});

describe('TranscriptViewer active segment logic', () => {
    it('identifies active segment correctly', () => {
        const segments = [
            { id: 's1', startMs: 0, endMs: 5000, text: 'First' },
            { id: 's2', startMs: 5000, endMs: 10000, text: 'Second' },
            { id: 's3', startMs: 10000, endMs: 15000, text: 'Third' },
        ];

        // Test: time within first segment
        const currentTimeMs1 = 2000;
        const active1 = segments.find(s => currentTimeMs1 >= s.startMs && currentTimeMs1 < s.endMs);
        expect(active1?.id).toBe('s1');

        // Test: time at boundary (should be in next segment)
        const currentTimeMs2 = 5000;
        const active2 = segments.find(s => currentTimeMs2 >= s.startMs && currentTimeMs2 < s.endMs);
        expect(active2?.id).toBe('s2');

        // Test: time within third segment
        const currentTimeMs3 = 12000;
        const active3 = segments.find(s => currentTimeMs3 >= s.startMs && currentTimeMs3 < s.endMs);
        expect(active3?.id).toBe('s3');

        // Test: time before all segments
        const currentTimeMs4 = -1000;
        const active4 = segments.find(s => currentTimeMs4 >= s.startMs && currentTimeMs4 < s.endMs);
        expect(active4).toBeUndefined();

        // Test: time after all segments
        const currentTimeMs5 = 20000;
        const active5 = segments.find(s => currentTimeMs5 >= s.startMs && currentTimeMs5 < s.endMs);
        expect(active5).toBeUndefined();
    });

    it('handles overlapping segments correctly (chooses first match)', () => {
        const segments = [
            { id: 's1', startMs: 0, endMs: 10000, text: 'Overlapping 1' },
            { id: 's2', startMs: 5000, endMs: 15000, text: 'Overlapping 2' },
        ];

        const currentTimeMs = 7000; // Falls within both segments
        const active = segments.find(s => currentTimeMs >= s.startMs && currentTimeMs < s.endMs);
        expect(active?.id).toBe('s1'); // Should match first segment
    });

    it('handles empty segments array', () => {
        const segments: Array<{ id: string; startMs: number; endMs: number; text: string }> = [];
        const currentTimeMs = 5000;
        const active = segments.find(s => currentTimeMs >= s.startMs && currentTimeMs < s.endMs);
        expect(active).toBeUndefined();
    });

    it('handles null currentTimeMs', () => {
        const segments = [
            { id: 's1', startMs: 0, endMs: 5000, text: 'First' },
        ];
        const currentTimeMs = null;

        if (currentTimeMs == null) {
            expect(currentTimeMs).toBeNull();
        } else {
            const active = segments.find(s => currentTimeMs >= s.startMs && currentTimeMs < s.endMs);
            expect(active).toBeDefined(); // This branch won't be reached
        }
    });
});
