/* @vitest-environment happy-dom */
import React from 'react';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TextViewer } from '../../TextViewer';

// Mock updateFile to resolve immediately and capture calls
vi.mock('@/services/api', () => {
    return {
        updateFile: vi.fn((_id: string, { content }: { content: string }) => Promise.resolve({ id: _id, content })),
    };
});

import { updateFile } from '@/services/api';

// Helper to flush promises/microtasks
const flush = async () => new Promise((r) => setTimeout(r, 15));

const sample = '00:00:01 Speaker: Hello world\n00:00:02 Speaker: Second line here\n';

describe('TextViewer undo/redo', () => {
    it('undo restores deleted block', async () => {
        const mount = (el: React.ReactElement) => {
            const div = document.createElement('div');
            document.body.appendChild(div);
            const root = createRoot(div);
            root.render(el);
            return div;
        };

        const container = mount(
            <TextViewer
                fileId="f1"
                content={sample}
                highlights={[]}
                onHighlightCreated={() => { }}
                isVtt
                framed={false}
                readOnly={false}
            />
        );
        await flush();

        // Find first block wrapper and its delete button (button is present but visually hidden until hover)
        const firstInner = container.querySelector('div[data-block-idx="0"]') as HTMLElement | null;
        expect(firstInner).toBeTruthy();
        const wrapper = firstInner!.parentElement as HTMLElement | null;
        expect(wrapper).toBeTruthy();
        const deleteBtn = wrapper!.querySelector('button');
        expect(deleteBtn).toBeTruthy();

        // Delete first block
        deleteBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();

        // After deletion, original content should have lost first line
        const updateFileMock = updateFile as unknown as Mock;
        const calls: string[] = updateFileMock.mock.calls.map((c: [string, { content: string }]) => c[1].content);
        // Last call content should not include 'Hello world'
        expect(calls[calls.length - 1]).not.toMatch(/Hello world/);

        // Send Cmd+Z keydown to undo
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
        await flush();

        // Undo triggers another updateFile call restoring original
        const postUndoCalls: string[] = updateFileMock.mock.calls.map((c: [string, { content: string }]) => c[1].content);
        expect(postUndoCalls[postUndoCalls.length - 1]).toMatch(/Hello world/);
    });
});
