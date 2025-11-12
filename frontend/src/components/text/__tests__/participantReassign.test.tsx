/* @vitest-environment happy-dom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TextViewer } from '../../TextViewer';

// Mock updateSegment pathway via onAssignParticipant callback
const assignSpy = vi.fn();

// Provide dummy participants
const participants = [
    { id: 'p1', name: 'Participant 1' },
    { id: 'p2', name: 'Participant 2' },
    { id: 'p3', name: 'Participant 3' },
];

// Build a tiny VTT-like sample content with bracketed timestamps and speakers
const content = '[00:00:01 - 00:00:02] Participant 1:\nHello first line\n[00:00:02 - 00:00:03] Participant 2:\nSecond line here\n';

// Metadata aligning each line (two blocks) with segment ids
const meta = [
    { segmentId: 's1', startMs: 1000, endMs: 2000, participantId: 'p1', participantName: 'Participant 1' },
    { segmentId: 's2', startMs: 2000, endMs: 3000, participantId: 'p2', participantName: 'Participant 2' },
];

const flush = async () => new Promise(r => setTimeout(r, 25));

function mount(el: React.ReactElement) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    root.render(el);
    return div;
}

describe('Participant reassignment popover', () => {
    it('allows multiple sequential reassignments without failing', async () => {
        const container = mount(
            <TextViewer
                fileId="f1"
                content={content}
                highlights={[]}
                onHighlightCreated={() => { }}
                isVtt
                framed={false}
                readOnly
                enableSelectionActions={false}
                vttMeta={meta}
                participants={participants as unknown as Array<{ id: string; name: string | null }>}
                onAssignParticipant={async (segmentId, pid) => {
                    assignSpy(segmentId, pid);
                }}
            />
        );
        await flush();

        // Find both speaker pill buttons (they have aria-label starting with 'Participant')
        const pills = Array.from(container.querySelectorAll('button[aria-label^="Participant "]')) as HTMLButtonElement[];
        expect(pills.length).toBeGreaterThanOrEqual(2);

        // Click first pill -> open popover
        pills[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
        // Select Participant 3
        const option3 = Array.from(document.querySelectorAll('[cmdk-item]')).find(el => el.getAttribute('data-value') === 'Participant 3');
        expect(option3).toBeTruthy();
        option3!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();

        // Click second pill -> open popover again
        pills[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
        // Select Participant 1
        const option1 = Array.from(document.querySelectorAll('[cmdk-item]')).find(el => el.getAttribute('data-value') === 'Participant 1');
        expect(option1).toBeTruthy();
        option1!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();

        // Verify two calls recorded with expected segment ids
        expect(assignSpy).toHaveBeenCalledTimes(2);
        expect(assignSpy.mock.calls[0][0]).toBe('s1');
        expect(assignSpy.mock.calls[1][0]).toBe('s2');
    });
});
