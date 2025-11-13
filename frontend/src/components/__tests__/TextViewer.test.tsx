import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { TextViewer } from '../TextViewer';
import type { Highlight } from '@/types';

// Mock sonner toast
vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe('TextViewer - State Management Fix', () => {
    const mockHighlights: Highlight[] = [];
    const mockOnHighlightCreated = vi.fn();

    describe('Rendering', () => {
        it('renders plain text content correctly', () => {
            const content = 'This is test content for the viewer.';
            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content={content}
                    highlights={mockHighlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    readOnly={true}
                />
            );

            expect(html).toContain(content);
        });

        it('renders VTT content with timestamps', () => {
            const vttContent = '00:00:05 Speaker: Hello world';
            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content={vttContent}
                    highlights={mockHighlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    isVtt={true}
                    readOnly={true}
                />
            );

            expect(html).toContain('Hello world');
            expect(html).toContain('00:00:05');
        });

        it('renders bracketed VTT format correctly', () => {
            const vttContent = '[00:00:05 - 00:00:10] Speaker: Hello world';
            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content={vttContent}
                    highlights={mockHighlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    isVtt={true}
                    readOnly={true}
                />
            );

            expect(html).toContain('Hello world');
            expect(html).toContain('00:00:05');
            expect(html).toContain('00:00:10');
        });
    });

    describe('Highlights', () => {
        it('renders highlights with correct markup', () => {
            const content = 'This is some highlighted text here.';
            const highlights: Highlight[] = [
                {
                    id: 'h1',
                    fileId: 'file-1',
                    codeName: 'Important',
                    startOffset: 13,
                    endOffset: 24,
                    text: 'highlighted',
                    createdAt: '2025-01-01T00:00:00Z',
                },
            ];

            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content={content}
                    highlights={highlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    readOnly={true}
                />
            );

            expect(html).toContain('highlighted');
            expect(html).toContain('role="mark"');
            expect(html).toContain('Code: Important');
        });

        it('handles multiple highlights in same text', () => {
            const content = 'Text with multiple highlights here.';
            const highlights: Highlight[] = [
                {
                    id: 'h1',
                    fileId: 'file-1',
                    codeName: 'Code1',
                    startOffset: 10,
                    endOffset: 18,
                    text: 'multiple',
                    createdAt: '2025-01-01T00:00:00Z',
                },
                {
                    id: 'h2',
                    fileId: 'file-1',
                    codeName: 'Code2',
                    startOffset: 19,
                    endOffset: 29,
                    text: 'highlights',
                    createdAt: '2025-01-01T00:00:00Z',
                },
            ];

            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content={content}
                    highlights={highlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    readOnly={true}
                />
            );

            expect(html).toContain('multiple');
            expect(html).toContain('highlights');
            expect(html).toContain('Code1');
            expect(html).toContain('Code2');
        });
    });

    describe('Frame Mode', () => {
        it('renders with Card frame when framed=true', () => {
            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content="Test content"
                    highlights={mockHighlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    framed={true}
                    readOnly={true}
                />
            );

            // Card component adds border and rounded classes
            expect(html).toContain('border');
            expect(html).toContain('rounded');
        });

        it('renders without Card frame when framed=false', () => {
            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content="Test content"
                    highlights={mockHighlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    framed={false}
                    readOnly={true}
                />
            );

            // Should still contain the content
            expect(html).toContain('Test content');
        });
    });

    describe('Accessibility', () => {
        it('adds proper ARIA labels to highlights', () => {
            const content = 'Test content with highlight';
            const highlights: Highlight[] = [
                {
                    id: 'h1',
                    fileId: 'file-1',
                    codeName: 'TestCode',
                    startOffset: 18,
                    endOffset: 27,
                    text: 'highlight',
                    createdAt: '2025-01-01T00:00:00Z',
                },
            ];

            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content={content}
                    highlights={highlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    readOnly={true}
                />
            );

            expect(html).toContain('aria-label="Code: TestCode"');
            expect(html).toContain('role="mark"');
        });
    });

    describe('Edge Cases', () => {
        it('renders empty content without errors', () => {
            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content=""
                    highlights={mockHighlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    readOnly={true}
                />
            );

            expect(html).toBeTruthy();
        });

        it('handles highlights with no codeName', () => {
            const content = 'Text with anonymous highlight';
            const highlights: Highlight[] = [
                {
                    id: 'h1',
                    fileId: 'file-1',
                    codeName: '',
                    startOffset: 10,
                    endOffset: 19,
                    text: 'anonymous',
                    createdAt: '2025-01-01T00:00:00Z',
                },
            ];

            const html = ReactDOMServer.renderToString(
                <TextViewer
                    fileId="file-1"
                    content={content}
                    highlights={highlights}
                    onHighlightCreated={mockOnHighlightCreated}
                    readOnly={true}
                />
            );

            expect(html).toContain('anonymous');
            expect(html).toContain('role="mark"');
        });
    });
});
