import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFiles, getHighlights, getProjects, deleteHighlight } from '@/services/api';
import type { Highlight } from '@/types';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useNavigate } from 'react-router-dom';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

export default function HighlightsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [projectId] = useSelectedProject();

  const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
  const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: () => getHighlights({ projectId }), enabled: !!projectId });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

  const projectName = projects.find(p => p.id === projectId)?.name || 'Project';
  const fileNameById = useMemo(() => Object.fromEntries(files.map(f => [f.id, f.filename] as const)), [files]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{projectName}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Highlights</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-xl font-extrabold uppercase tracking-wide">Highlights</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Snippet</TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {highlights.map(h => (
            <TableRow key={h.id}>
              <TableCell className="text-xs text-neutral-700">{h.codeName}</TableCell>
              <TableCell className="text-sm max-w-[48ch] truncate">{h.text}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" className="rounded-none h-7 px-2" onClick={() => navigate(`/documents/${h.fileId}`)}>
                  {fileNameById[h.fileId] ?? 'Open' }
                </Button>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="destructive" className="rounded-none h-7 px-2" onClick={async () => { if (!confirm('Delete this highlight?')) return; await deleteHighlight(h.id); qc.invalidateQueries({ queryKey: ['highlights', projectId] }); }}>
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {highlights.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-neutral-600">No highlights yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
