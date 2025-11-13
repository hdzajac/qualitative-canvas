import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { CanvasEntityPanel } from '../CanvasEntityPanel';
import type { NodeView } from '../CanvasTypes';
import type { Highlight, Theme } from '../../../types';

// Mock API calls
vi.mock('../../../services/api', () => ({
    deleteHighlight: vi.fn(),
    deleteTheme: vi.fn(),
    deleteInsight: vi.fn(),
    deleteAnnotation: vi.fn(),
    updateHighlight: vi.fn(),
    updateTheme: vi.fn(),
    updateInsight: vi.fn(),
    updateAnnotation: vi.fn(),
}));

describe('CanvasEntityPanel', () => {
    const mockOnClose = vi.fn();
    const mockOnUpdate = vi.fn();
    const mockOnNodeUpdate = vi.fn();

    const mockHighlight: Highlight = {
        id: 'code1',
        fileId: 'file1',
        codeName: 'Test Code',
        text: 'Sample code text',
        startOffset: 0,
        endOffset: 10,
        createdAt: '2024-01-01T00:00:00Z',
    };

    const mockTheme: Theme = {
        id: 'theme1',
        name: 'Test Theme',
        highlightIds: ['code1'],
        createdAt: '2024-01-01T00:00:00Z',
    };

    const mockCodeNode: NodeView = {
        kind: 'code',
        id: 'code1',
        x: 0,
        y: 0,
        w: 200,
        h: 100,
        highlight: mockHighlight,
    } as NodeView;

    const mockThemeNode: NodeView = {
        kind: 'theme',
        id: 'theme1',
        x: 0,
        y: 0,
        w: 200,
        h: 100,
        theme: mockTheme,
    } as NodeView;

    const mockInsightNode: NodeView = {
        kind: 'insight',
        id: 'insight1',
        x: 0,
        y: 0,
        w: 200,
        h: 100,
        insight: {
            id: 'insight1',
            name: 'Test Insight',
            themeIds: ['theme1'],
            createdAt: '2024-01-01T00:00:00Z',
        },
    } as NodeView;

    const mockAnnotationNode: NodeView = {
        kind: 'annotation',
        id: 'anno1',
        x: 0,
        y: 0,
        w: 200,
        h: 100,
        annotation: {
            id: 'anno1',
            content: 'Test annotation',
            position: { x: 0, y: 0 },
            size: { w: 200, h: 100 },
        },
    } as NodeView;

    const baseProps = {
        nodes: [mockCodeNode, mockThemeNode, mockInsightNode, mockAnnotationNode],
        themes: [mockTheme],
        fileNames: { file1: 'Document 1' },
        fileNameById: new Map([['file1', 'Document 1']]),
        codeFileNameById: new Map([['code1', 'Document 1']]),
        highlightById: new Map([['code1', mockHighlight]]),
        themeById: new Map([['theme1', mockTheme]]),
        onClose: mockOnClose,
        onUpdate: mockOnUpdate,
        onNodeUpdate: mockOnNodeUpdate,
    };

    it('returns null when entity is null', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={null} />
        );
        expect(html).toBe('');
    });

    it('returns null when node is not found', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'code', id: 'nonexistent' }} />
        );
        expect(html).toBe('');
    });

    it('renders code entity with title and content', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'code', id: 'code1' }} />
        );

        expect(html).toContain('Test Code');
        expect(html).toContain('Sample code text');
        expect(html).toContain('Document:');
        expect(html).toContain('Document 1');
        expect(html).toContain('Close');
        expect(html).toContain('Delete');
    });

    it('renders theme entity with name and associated codes', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'theme', id: 'theme1' }} />
        );

        expect(html).toContain('Test Theme');
        expect(html).toContain('Documents');
        expect(html).toContain('Codes');
        expect(html).toContain('Test Code');
        expect(html).toContain('Document 1');
    });

    it('renders insight entity with name and associated themes', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'insight', id: 'insight1' }} />
        );

        expect(html).toContain('Test Insight');
        expect(html).toContain('Themes');
        expect(html).toContain('Test Theme');
        expect(html).toContain('Test Code');
    });

    it('renders annotation entity with content', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'annotation', id: 'anno1' }} />
        );

        expect(html).toContain('Test annotation');
    });

    it('includes click-away overlay', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'code', id: 'code1' }} />
        );

        // Check for overlay div
        expect(html).toContain('z-20');
    });

    it('renders close and delete buttons', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'code', id: 'code1' }} />
        );

        expect(html).toContain('aria-label="Close"');
        expect(html).toContain('Delete');
    });

    it('shows editable input for theme name', () => {
        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel {...baseProps} entity={{ kind: 'theme', id: 'theme1' }} />
        );

        expect(html).toContain('value="Test Theme"');
        expect(html).toContain('input');
    });

    it('displays "No content" for empty code body', () => {
        const emptyCodeNode: NodeView = {
            kind: 'code',
            id: 'code1',
            x: 0,
            y: 0,
            w: 200,
            h: 100,
            highlight: { ...mockHighlight, text: '' },
        } as NodeView;

        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel
                {...baseProps}
                nodes={[emptyCodeNode]}
                entity={{ kind: 'code', id: 'code1' }}
            />
        );

        expect(html).toContain('No content');
    });

    it('handles code with no fileId', () => {
        const noFileCodeNode: NodeView = {
            kind: 'code',
            id: 'code1',
            x: 0,
            y: 0,
            w: 200,
            h: 100,
            highlight: { ...mockHighlight, fileId: '' },
        } as NodeView;

        const html = ReactDOMServer.renderToString(
            <CanvasEntityPanel
                {...baseProps}
                nodes={[noFileCodeNode]}
                entity={{ kind: 'code', id: 'code1' }}
            />
        );

        // Should not show "Document:" line
        expect(html).not.toContain('Document:');
        expect(html).toContain('Test Code');
    });
});
