import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFiles, getThemes, getHighlights } from '@/services/api';
import type { Theme, Highlight } from '@/types';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useNavigate } from 'react-router-dom';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export default function Themes() {
  const navigate = useNavigate();
  const [projectId] = useSelectedProject();
  const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
  const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: getThemes, enabled: !!projectId });
  const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: getHighlights, enabled: !!projectId });

  const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
  const projectHighlights = useMemo(() => highlights.filter(h => fileIds.has(h.fileId)), [highlights, fileIds]);
  const highlightById = useMemo(() => {
    const m = new Map(projectHighlights.map(h => [h.id, h] as const));
    return m;
  }, [projectHighlights]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-xl font-extrabold uppercase tracking-wide">Themes</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"> </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Codes</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {themes.map(t => (
            <>
              <TableRow key={t.id} className="cursor-pointer" onClick={() => toggle(t.id)}>
                <TableCell>{expanded[t.id] ? '-' : '+'}</TableCell>
                <TableCell className="font-semibold">{t.name}</TableCell>
                <TableCell>{t.highlightIds.length}</TableCell>
                <TableCell>
                  {/* Open first source document if exists */}
                  {t.highlightIds.length > 0 && (() => {
                    const first = highlightById.get(t.highlightIds[0]);
                    if (!first) return null;
                    return (
                      <Button size="sm" variant="outline" className="rounded-none h-7 px-2" onClick={(e) => { e.stopPropagation(); navigate(`/documents/${first.fileId}`); }}>
                        Open source
                      </Button>
                    );
                  })()}
                </TableCell>
              </TableRow>
              {expanded[t.id] && t.highlightIds.map(hid => {
                const h = highlightById.get(hid);
                if (!h) return null;
                return (
                  <TableRow key={`${t.id}-${hid}`} className="bg-neutral-50">
                    <TableCell />
                    <TableCell colSpan={3}>
                      <div className="text-xs text-neutral-500">{h.codeName}</div>
                      <div className="text-sm">{h.text}</div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </>
          ))}
          {themes.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-neutral-600">No themes yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
