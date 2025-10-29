import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFiles, getThemes, getInsights, getHighlights } from '@/services/api';
import type { Theme, Insight, Highlight } from '@/types';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useSelectedProject } from '@/hooks/useSelectedProject';

export default function Insights() {
  const navigate = useNavigate();
  const [projectId] = useSelectedProject();
  const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
  const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: getThemes, enabled: !!projectId });
  const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: getHighlights, enabled: !!projectId });
  const { data: insights = [] } = useQuery<Insight[]>({ queryKey: ['insights', projectId], queryFn: getInsights, enabled: !!projectId });

  const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
  const projectHighlights = useMemo(() => highlights.filter(h => fileIds.has(h.fileId)), [highlights, fileIds]);
  const highlightById = useMemo(() => new Map(projectHighlights.map(h => [h.id, h] as const)), [projectHighlights]);
  const themeById = useMemo(() => new Map(themes.map(t => [t.id, t] as const)), [themes]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-xl font-extrabold uppercase tracking-wide">Insights</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"> </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Themes</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {insights.map(i => (
            <>
              <TableRow key={i.id} className="cursor-pointer" onClick={() => toggle(i.id)}>
                <TableCell>{expanded[i.id] ? '-' : '+'}</TableCell>
                <TableCell className="font-semibold">{i.name}</TableCell>
                <TableCell>{i.themeIds.length}</TableCell>
                <TableCell>
                  {/* Open first source document via first theme -> first highlight */}
                  {(() => {
                    const firstTheme = themeById.get(i.themeIds[0]);
                    const firstHighlightId = firstTheme?.highlightIds[0];
                    const firstHighlight = firstHighlightId ? highlightById.get(firstHighlightId) : undefined;
                    if (!firstHighlight) return null;
                    return (
                      <Button size="sm" variant="outline" className="rounded-none h-7 px-2" onClick={(e) => { e.stopPropagation(); navigate(`/documents/${firstHighlight.fileId}`); }}>
                        Open source
                      </Button>
                    );
                  })()}
                </TableCell>
              </TableRow>
              {expanded[i.id] && i.themeIds.map(tid => {
                const t = themeById.get(tid);
                if (!t) return null;
                return (
                  <TableRow key={`${i.id}-${tid}`} className="bg-neutral-50">
                    <TableCell />
                    <TableCell colSpan={3}>
                      <div className="font-semibold uppercase tracking-wide">{t.name}</div>
                      <div className="mt-2 space-y-1">
                        {t.highlightIds.map(hid => {
                          const h = highlightById.get(hid);
                          if (!h) return null;
                          return (
                            <div key={`${tid}-${hid}`} className="text-sm">
                              <span className="text-xs text-neutral-500">{h.codeName}: </span>
                              {h.text}
                            </div>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </>
          ))}
          {insights.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-neutral-600">No insights yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
