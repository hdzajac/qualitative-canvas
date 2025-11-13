import { useState } from 'react';
import { Button } from '../ui/button';
import { X as CloseIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { NodeView, NodeKind } from './CanvasTypes';
import type { Highlight, Theme } from '../../types';
import {
    deleteHighlight,
    deleteTheme,
    deleteInsight,
    deleteAnnotation,
    updateHighlight,
    updateTheme,
    updateInsight,
    updateAnnotation,
} from '../../services/api';

interface CanvasEntityPanelProps {
    entity: { kind: NodeKind; id: string } | null;
    nodes: NodeView[];
    themes: Theme[];
    fileNames: Record<string, string>;
    fileNameById: Map<string, string>;
    codeFileNameById: Map<string, string>;
    highlightById: Map<string, Highlight>;
    themeById: Map<string, Theme>;
    onClose: () => void;
    onUpdate: () => void;
    onNodeUpdate: (updatedNodes: NodeView[]) => void;
}

/**
 * Side panel for viewing and editing entity details (codes, themes, insights, annotations)
 */
export const CanvasEntityPanel: React.FC<CanvasEntityPanelProps> = ({
    entity,
    nodes,
    themes,
    fileNames,
    fileNameById,
    codeFileNameById,
    highlightById,
    themeById,
    onClose,
    onUpdate,
    onNodeUpdate,
}) => {
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');

    if (!entity) return null;

    const handleDelete = async () => {
        if (!confirm('Delete this item?')) return;
        try {
            if (entity.kind === 'code') await deleteHighlight(entity.id);
            if (entity.kind === 'theme') await deleteTheme(entity.id);
            if (entity.kind === 'insight') await deleteInsight(entity.id);
            if (entity.kind === 'annotation') await deleteAnnotation(entity.id);
            onClose();
            onUpdate();
        } catch {
            toast.error('Delete failed');
        }
    };

    const saveCodeTitle = async (id: string, name: string) => {
        const val = name.trim();
        const node = nodes.find((nn) => nn.kind === 'code' && nn.id === id);
        if (!node) return;
        try {
            await updateHighlight(id, { codeName: val });
            onNodeUpdate(
                nodes.map((nn) =>
                    nn.kind === 'code' && nn.id === id
                        ? { ...nn, highlight: { ...nn.highlight!, codeName: val } }
                        : nn
                )
            );
            onUpdate();
            toast.success('Saved');
        } catch {
            toast.error('Save failed');
        }
    };

    const n = nodes.find((nn) => nn.kind === entity.kind && nn.id === entity.id);
    if (!n) return null;

    return (
        <>
            {/* Click-away overlay */}
            <div className="absolute inset-0 z-20" onClick={onClose} />

            {/* Side Panel */}
            <div
                className="absolute inset-y-0 right-0 z-30 w-[420px] bg-white border-l-4 border-black p-4 flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with close and delete */}
                <div className="flex items-center justify-between mb-3">
                    <Button
                        size="icon"
                        variant="outline"
                        className="rounded-none"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-none"
                        onClick={handleDelete}
                    >
                        Delete
                    </Button>
                </div>

                {/* Content based on entity kind */}
                {n.kind === 'code' ? (
                    <>
                        {/* Title editable on click */}
                        <div className="mb-1">
                            {!editingTitle ? (
                                <div
                                    className="text-xl font-bold break-words cursor-text"
                                    onClick={() => {
                                        setTitleDraft(n.highlight?.codeName || 'Untitled');
                                        setEditingTitle(true);
                                    }}
                                >
                                    {n.highlight?.codeName || 'Untitled'}
                                </div>
                            ) : (
                                <input
                                    className="w-full border-2 border-black px-2 py-1 text-xl font-bold"
                                    autoFocus
                                    value={titleDraft}
                                    onChange={(e) => setTitleDraft(e.target.value)}
                                    onBlur={async () => {
                                        await saveCodeTitle(n.id, titleDraft);
                                        setEditingTitle(false);
                                    }}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                            (e.target as HTMLInputElement).blur();
                                        }
                                        if (e.key === 'Escape') {
                                            setEditingTitle(false);
                                        }
                                    }}
                                />
                            )}
                        </div>
                        {/* Document reference */}
                        {n.highlight?.fileId ? (
                            <div className="text-sm text-neutral-600 mb-3">
                                Document: {fileNames[n.highlight.fileId] ?? '...'}
                            </div>
                        ) : null}
                        {/* Body */}
                        <div className="overflow-auto pr-2">
                            {(() => {
                                const body = n.highlight?.text || '';
                                return body ? (
                                    <pre className="whitespace-pre-wrap text-sm leading-relaxed">{body}</pre>
                                ) : (
                                    <div className="text-sm text-neutral-500">No content.</div>
                                );
                            })()}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Other kinds: theme, insight, annotation */}
                        <div className="flex items-center gap-2 mb-3">
                            <input
                                className="border-2 border-black px-2 py-1 flex-1"
                                defaultValue={(() => {
                                    return n.kind === 'theme'
                                        ? n.theme?.name || ''
                                        : n.kind === 'insight'
                                            ? n.insight?.name || ''
                                            : n.annotation?.content || '';
                                })()}
                                onBlur={async (e) => {
                                    const val = e.target.value.trim();
                                    try {
                                        if (n.kind === 'theme') await updateTheme(n.id, { name: val });
                                        if (n.kind === 'insight') await updateInsight(n.id, { name: val });
                                        if (n.kind === 'annotation') await updateAnnotation(n.id, { content: val });
                                        onUpdate();
                                    } catch {
                                        toast.error('Save failed');
                                    }
                                }}
                            />
                        </div>

                        {/* List document filenames for themes and insights */}
                        {(n.kind === 'theme' || n.kind === 'insight') && (
                            <div className="mb-3 text-sm text-neutral-600">
                                <div className="font-semibold mb-1">Documents</div>
                                <ul className="list-disc list-inside space-y-0.5">
                                    {(() => {
                                        const names: string[] =
                                            n.kind === 'theme'
                                                ? Array.from(
                                                    new Set(
                                                        n.theme!.highlightIds
                                                            .map((hid: string) => codeFileNameById.get(hid))
                                                            .filter((x: string | undefined): x is string => Boolean(x))
                                                    )
                                                )
                                                : Array.from(
                                                    new Set(
                                                        n.insight!.themeIds.flatMap((tid: string) => {
                                                            const t = themes.find((tt) => tt.id === tid);
                                                            return t
                                                                ? t.highlightIds
                                                                    .map((hid: string) => codeFileNameById.get(hid))
                                                                    .filter((x: string | undefined): x is string => Boolean(x))
                                                                : [];
                                                        })
                                                    )
                                                );
                                        return names.map((name) => <li key={name}>{name}</li>);
                                    })()}
                                </ul>
                            </div>
                        )}

                        {/* Underlying items: codes for themes */}
                        {n.kind === 'theme' && (
                            <div className="mb-3 text-sm text-neutral-800">
                                <div className="font-semibold mb-1">Codes</div>
                                <ul className="list-disc list-inside space-y-0.5">
                                    {n.theme!.highlightIds.map((hid: string) => {
                                        const h = highlightById.get(hid);
                                        if (!h) return null;
                                        const doc = h.fileId ? fileNameById.get(h.fileId) || '' : '';
                                        const label = h.codeName || '(untitled)';
                                        return (
                                            <li key={hid}>
                                                <span className="font-medium">{label}</span>
                                                {doc ? <span className="text-neutral-500"> — {doc}</span> : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* Underlying items: themes and codes for insights */}
                        {n.kind === 'insight' && (
                            <div className="mb-3 text-sm text-neutral-800 space-y-2">
                                <div className="font-semibold mb-1">Themes</div>
                                {n.insight!.themeIds.map((tid: string) => {
                                    const t = themeById.get(tid);
                                    if (!t) return null;
                                    return (
                                        <div key={tid} className="ml-1">
                                            <div className="font-medium">• {t.name || '(untitled theme)'}</div>
                                            <ul className="list-disc list-inside space-y-0.5 ml-4 mt-1">
                                                {t.highlightIds.map((hid: string) => {
                                                    const h = highlightById.get(hid);
                                                    if (!h) return null;
                                                    const doc = h.fileId ? fileNameById.get(h.fileId) || '' : '';
                                                    const label = h.codeName || '(untitled)';
                                                    return (
                                                        <li key={hid}>
                                                            <span className="font-normal">{label}</span>
                                                            {doc ? <span className="text-neutral-500"> — {doc}</span> : null}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Annotation body content */}
                        <div className="overflow-auto pr-2">
                            {(() => {
                                const body = n.kind === 'annotation' ? n.annotation?.content || '' : '';
                                return body ? (
                                    <pre className="whitespace-pre-wrap text-sm leading-relaxed">{body}</pre>
                                ) : (
                                    <div className="text-sm text-neutral-500">No content.</div>
                                );
                            })()}
                        </div>
                    </>
                )}
            </div>
        </>
    );
};
