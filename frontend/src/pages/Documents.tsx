import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFiles, deleteFile } from '@/services/api';
import type { UploadedFile } from '@/types';
import { FileUpload } from '@/components/FileUpload';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

export default function Documents() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [projectId] = useSelectedProject();
  const { data: files } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });

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
            <BreadcrumbPage>Documents</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-extrabold uppercase tracking-wide">Documents</h1>
        <div className="ml-auto">
          <FileUpload renderAs="button" projectId={projectId} onFileUploaded={() => qc.invalidateQueries({ queryKey: ['files'] })} />
        </div>
      </div>

      {projectId ? (
        <div className="divide-y-2 divide-black border-2 border-black bg-white">
          {files?.map((f: UploadedFile) => (
            <div
              key={f.id}
              className="p-2 flex items-center gap-2 cursor-pointer hover:bg-indigo-50"
              onClick={() => navigate(`/documents/${f.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{f.filename}</div>
                <div className="text-[11px] text-neutral-500 truncate">{new Date(f.createdAt).toLocaleString()}</div>
              </div>
              <Button
                variant="destructive"
                className="rounded-none h-8 px-3"
                onClick={(e) => { e.stopPropagation(); remove.mutate(f.id); }}
              >
                Delete
              </Button>
            </div>
          ))}
          {files && files.length === 0 && (
            <div className="p-3 text-sm text-neutral-600">No documents yet. Upload a .txt file.</div>
          )}
        </div>
      ) : (
        <div className="text-sm text-neutral-600">You must select a project first.</div>
      )}
    </div>
  );
}
