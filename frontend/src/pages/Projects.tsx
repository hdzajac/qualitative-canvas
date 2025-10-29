import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, createProject, updateProject, deleteProject } from '@/services/api';
import type { Project } from '@/types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Projects() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const add = useMutation({
    mutationFn: () => createProject({ name, description }),
    onSuccess: () => { setName(''); setDescription(''); qc.invalidateQueries({ queryKey: ['projects'] }); },
  });
  const save = useMutation({
    mutationFn: (p: Project) => updateProject(p.id, { name: p.name, description: p.description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader><CardTitle>Create project</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button onClick={() => add.mutate()} disabled={!name}>Add</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} className="p-4 space-y-3">
            <Input value={p.name} onChange={(e) => save.mutate({ ...p, name: e.target.value })} />
            <Input value={p.description || ''} onChange={(e) => save.mutate({ ...p, description: e.target.value })} />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => remove.mutate(p.id)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
