import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getProjectDetail, getProjectMembers, addProjectMember,
    updateProjectMember, removeProjectMember,
    getHighlights, getThemes, getInsights, getFiles,
    deleteProject,
    type ProjectMember,
} from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function ProjectDetailPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { user } = useAuth();

    const { data: project, isLoading: loadingProject } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => getProjectDetail(projectId!),
        enabled: !!projectId,
    });
    const { data: members = [], isLoading: loadingMembers } = useQuery({
        queryKey: ['project-members', projectId],
        queryFn: () => getProjectMembers(projectId!),
        enabled: !!projectId,
    });
    const { data: highlights = [] } = useQuery({ queryKey: ['highlights', projectId], queryFn: () => getHighlights({ projectId: projectId! }), enabled: !!projectId });
    const { data: themes = [] } = useQuery({ queryKey: ['themes', projectId], queryFn: () => getThemes(projectId!), enabled: !!projectId });
    const { data: insights = [] } = useQuery({ queryKey: ['insights', projectId], queryFn: () => getInsights(projectId!), enabled: !!projectId });
    const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId!), enabled: !!projectId });

    const isOwner = project?.role === 'owner';

    // Add member form
    const [addEmail, setAddEmail] = useState('');
    const [addRole, setAddRole] = useState<'owner' | 'member'>('member');

    const addMutation = useMutation({
        mutationFn: () => addProjectMember(projectId!, addEmail, addRole),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['project-members', projectId] });
            setAddEmail('');
            toast.success('Member added');
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const removeMutation = useMutation({
        mutationFn: (userId: string) => removeProjectMember(projectId!, userId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
        onError: (err: Error) => toast.error(err.message),
    });

    const roleMutation = useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: 'owner' | 'member' }) =>
            updateProjectMember(projectId!, userId, role),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
        onError: (err: Error) => toast.error(err.message),
    });

    // Delete project
    const [showDelete, setShowDelete] = useState(false);
    const deleteMutation = useMutation({
        mutationFn: () => deleteProject(projectId!),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['projects'] });
            navigate('/projects', { replace: true });
            toast.success('Project deleted');
        },
        onError: (err: Error) => toast.error(err.message),
    });

    if (loadingProject) return null;
    if (!project) return <p className="p-8 text-muted-foreground">Project not found.</p>;

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-10">
            {/* Header */}
            <div>
                <Button variant="outline" size="sm" onClick={() => navigate('/projects')}
                    className="mb-4 border border-black rounded-none uppercase text-xs">
                    ← Back to Projects
                </Button>
                <h1 className="text-3xl font-extrabold uppercase tracking-wide border-b-4 border-black pb-2">
                    {project.name}
                </h1>
                {project.description && <p className="mt-2 text-muted-foreground">{project.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(project.createdAt).toLocaleDateString()} · Your role:{' '}
                    <span className="uppercase font-semibold">{project.role}</span>
                </p>
            </div>

            {/* Stats overview */}
            <section>
                <h2 className="font-bold uppercase tracking-wide mb-3 text-sm border-b border-gray-200 pb-1">Overview</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: 'Documents', value: files.length },
                        { label: 'Codes', value: highlights.length },
                        { label: 'Themes', value: themes.length },
                        { label: 'Insights', value: insights.length },
                    ].map(({ label, value }) => (
                        <div key={label} className="border-2 border-black p-4 text-center">
                            <p className="text-3xl font-extrabold">{value}</p>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1">{label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Members */}
            <section>
                <h2 className="font-bold uppercase tracking-wide mb-3 text-sm border-b border-gray-200 pb-1">Members</h2>
                {loadingMembers ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b-2 border-black">
                                <th className="text-left py-1 pr-4">User</th>
                                <th className="text-left py-1 pr-4">Role</th>
                                {isOwner && <th className="text-left py-1">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((m: ProjectMember) => (
                                <tr key={m.id} className="border-b border-gray-100">
                                    <td className="py-2 pr-4">
                                        <p className="font-medium">{m.displayName ?? m.email}</p>
                                        {m.displayName && <p className="text-xs text-muted-foreground">{m.email}</p>}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {isOwner && m.id !== user?.id ? (
                                            <Select
                                                value={m.role}
                                                onValueChange={(val) => roleMutation.mutate({ userId: m.id, role: val as 'owner' | 'member' })}
                                            >
                                                <SelectTrigger className="h-7 text-xs border-black rounded-none w-28">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="owner">Owner</SelectItem>
                                                    <SelectItem value="member">Member</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <span className="uppercase text-xs font-semibold">{m.role}</span>
                                        )}
                                    </td>
                                    {isOwner && (
                                        <td className="py-2">
                                            {m.id !== user?.id && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => removeMutation.mutate(m.id)}
                                                    className="border border-red-400 text-red-600 rounded-none uppercase text-xs hover:bg-red-50"
                                                >
                                                    Remove
                                                </Button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Add member form (owner only) */}
                {isOwner && (
                    <form
                        onSubmit={e => { e.preventDefault(); addMutation.mutate(); }}
                        className="mt-4 flex gap-2 items-end flex-wrap"
                    >
                        <div className="space-y-1 flex-1 min-w-[180px]">
                            <Label htmlFor="addEmail" className="text-xs uppercase">Add by email</Label>
                            <Input
                                id="addEmail"
                                type="email"
                                value={addEmail}
                                onChange={e => setAddEmail(e.target.value)}
                                placeholder="colleague@ku.dk"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs uppercase">Role</Label>
                            <Select value={addRole} onValueChange={v => setAddRole(v as 'owner' | 'member')}>
                                <SelectTrigger className="h-10 border-black rounded-none w-28">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="member">Member</SelectItem>
                                    <SelectItem value="owner">Owner</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            type="submit"
                            disabled={addMutation.isPending}
                            className="border-2 border-black rounded-none uppercase text-xs"
                        >
                            Add
                        </Button>
                    </form>
                )}
            </section>

            {/* Danger zone (owner only) */}
            {isOwner && (
                <section>
                    <h2 className="font-bold uppercase tracking-wide mb-3 text-sm border-b border-red-300 pb-1 text-red-600">
                        Danger Zone
                    </h2>
                    <Button
                        variant="outline"
                        onClick={() => setShowDelete(true)}
                        className="border-2 border-red-500 text-red-600 rounded-none uppercase tracking-wide text-xs hover:bg-red-50"
                    >
                        Delete Project
                    </Button>
                </section>
            )}

            {/* Delete confirmation */}
            <Dialog open={showDelete} onOpenChange={setShowDelete}>
                <DialogContent className="rounded-none border-4 border-red-500 max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="uppercase text-red-600">Delete Project?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm">
                        This will permanently delete <strong>{project.name}</strong> and all its documents, codes, themes, and insights. This cannot be undone.
                    </p>
                    <DialogFooter className="gap-2 flex-row">
                        <Button variant="outline" onClick={() => setShowDelete(false)} className="rounded-none border-2 border-black uppercase text-xs">
                            Cancel
                        </Button>
                        <Button
                            onClick={() => deleteMutation.mutate()}
                            disabled={deleteMutation.isPending}
                            className="rounded-none border-2 border-red-500 bg-red-500 text-white uppercase text-xs hover:bg-red-600"
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
