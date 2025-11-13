import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { CanvasHelpPanel } from '../CanvasHelpPanel';

describe('CanvasHelpPanel', () => {
    it('renders help button when visible is false', () => {
        const onToggle = vi.fn();
        const html = ReactDOMServer.renderToString(
            <CanvasHelpPanel visible={false} onToggle={onToggle} />
        );

        expect(html).toContain('Canvas help');
        expect(html).not.toContain('Canvas Shortcuts &amp; Tips');
    });

    it('renders help button and panel when visible is true', () => {
        const onToggle = vi.fn();
        const html = ReactDOMServer.renderToString(
            <CanvasHelpPanel visible={true} onToggle={onToggle} />
        );

        expect(html).toContain('Canvas help');
        expect(html).toContain('Canvas Shortcuts &amp; Tips');
    });

    it('displays all keyboard shortcuts in panel', () => {
        const onToggle = vi.fn();
        const html = ReactDOMServer.renderToString(
            <CanvasHelpPanel visible={true} onToggle={onToggle} />
        );

        // Check for key shortcuts
        expect(html).toContain('Space');
        expect(html).toContain('Wheel');
        expect(html).toContain('>V<');
        expect(html).toContain('>H<');
        expect(html).toContain('>T<');
        expect(html).toContain('>I<');
        expect(html).toContain('Delete');

        // Check for descriptions
        expect(html).toContain('pan view');
        expect(html).toContain('zoom at cursor');
        expect(html).toContain('select tool');
        expect(html).toContain('hand (pan) tool');
        expect(html).toContain('multi-select');
    });

    it('displays usage tips', () => {
        const onToggle = vi.fn();
        const html = ReactDOMServer.renderToString(
            <CanvasHelpPanel visible={true} onToggle={onToggle} />
        );

        expect(html).toContain('Drag small right-side dot');
        expect(html).toContain('Code→Theme');
        expect(html).toContain('Theme→Insight');
        expect(html).toContain('Hover connection');
        expect(html).toContain('Text tool');
    });

    it('includes close button in panel', () => {
        const onToggle = vi.fn();
        const html = ReactDOMServer.renderToString(
            <CanvasHelpPanel visible={true} onToggle={onToggle} />
        );

        expect(html).toContain('close');
    });
});
