import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, createProject, updateProject, deleteProject } from '@/services/api';
import type { Project } from '@/types';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MoreHorizontal, Plus, Upload, Download } from 'lucide-react';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import ImportDialog from '@/components/ImportDialog';
import { ExportDialog } from '@/components/ExportDialog';

export default function Projects() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [selectedProjectId, setSelectedProjectId] = useSelectedProject();

  // New project UI
  const [showNew, setShowNew] = useState(projects.length === 0);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Import dialog
  const [showImport, setShowImport] = useState(false);

  // Export dialog
  const [showExport, setShowExport] = useState(false);
  const [exportingProject, setExportingProject] = useState<Project | null>(null);

  const add = useMutation({
    mutationFn: () => createProject({ name: newName.trim(), description: newDesc.trim() || undefined }),
    onSuccess: (p) => {
      setNewName('');
      setNewDesc('');
      setShowNew(false);
      qc.invalidateQueries({ queryKey: ['projects'] });
      // Optional: select newly created project
      setSelectedProjectId(p.id);
      navigate('/documents');
    },
  });

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const startEdit = (p: Project) => {
    setEditing(p);
    setEditName(p.name);
    setEditDesc(p.description || '');
    setEditOpen(true);
  };

  const save = useMutation({
    mutationFn: () => updateProject(editing!.id, { name: editName.trim(), description: editDesc.trim() || undefined }),
    onSuccess: () => {
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      if (selectedProjectId && projects.find(p => p.id === selectedProjectId) === undefined) {
        setSelectedProjectId(undefined);
      }
    },
  });

  const onSelect = (p: Project) => {
    setSelectedProjectId(p.id);
    navigate('/documents');
  };

  const hasProjects = projects.length > 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold uppercase tracking-wide">Projects</h1>
        {hasProjects && (
          <div className="ml-auto flex gap-2">
            <Button className="brutal-button" variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
            <Button className="brutal-button" onClick={() => setShowNew(v => !v)}>
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          </div>
        )}
      </div>

      {showNew && (
        <div className="brutal-card p-4 bg-white">
          <div className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <Button className="brutal-button" onClick={() => add.mutate()} disabled={!newName.trim()}>Create</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const selected = selectedProjectId === p.id;
          return (
            <Card key={p.id} className={`brutal-card p-4 cursor-pointer ${selected ? 'bg-indigo-50' : 'bg-white'}`} onClick={() => onSelect(p)}>
              <div className="flex items-start">
                <div className="flex-1 pr-2">
                  <div className="text-lg font-bold uppercase tracking-wide">{p.name}</div>
                  {p.description && <div className="text-sm text-neutral-600 mt-1">{p.description}</div>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="rounded-none p-1 h-auto" onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => startEdit(p)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setExportingProject(p); setShowExport(true); }}>
                      <Download className="h-4 w-4 mr-2" />Export
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={() => remove.mutate(p.id)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-3 text-xs text-neutral-500">Created {new Date(p.createdAt).toLocaleString()}</div>
            </Card>
          );
        })}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-none border-4 border-black">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button className="brutal-button" onClick={() => save.mutate()} disabled={!editName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onSuccess={(projectId) => {
            setShowImport(false);
            setSelectedProjectId(projectId);
            navigate('/documents');
          }}
        />
      )}

      {exportingProject && (
        <ExportDialog
          projectId={exportingProject.id}
          projectName={exportingProject.name}
          open={showExport}
          onOpenChange={(open) => {
            setShowExport(open);
            if (!open) setExportingProject(null);
          }}
        />
      )}
    </div>
  );
}
