import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { DocumentViewer } from '@/components/DocumentViewer';
import type { Highlight } from '@/types';

const highlights: Highlight[] = [];

describe('DocumentViewer extensibility', () => {
    it('renders center content and side panels (SSR smoke)', () => {
        const onCreated = vi.fn();
        const html = ReactDOMServer.renderToString(
            <DocumentViewer
                fileId="f1"
                content={"00:00:01 Alice: Hello"}
                highlights={highlights}
                onHighlightCreated={onCreated}
                isVtt
                framed={false}
                leftPanel={<div data-test="left">Left Panel</div>}
                rightPanel={<div data-test="right">Right Panel</div>}
                headerExtras={<div data-test="header">Header</div>}
                footer={<div data-test="footer">Footer</div>}
                readOnly
                enableSelectionActions={false}
            />
        );
        expect(html).toContain('data-test="left"');
        expect(html).toContain('data-test="right"');
        expect(html).toContain('data-test="header"');
        expect(html).toContain('data-test="footer"');
    });
});
