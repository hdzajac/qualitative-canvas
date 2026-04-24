import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authUpdateProfile } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const qc = useQueryClient();

    const [displayName, setDisplayName] = useState(user?.displayName ?? '');
    const [editing, setEditing] = useState(false);

    const updateMutation = useMutation({
        mutationFn: () => authUpdateProfile(displayName),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auth', 'me'] });
            setEditing(false);
            toast.success('Profile updated');
        },
        onError: (err: Error) => toast.error(err.message),
    });

    if (!user) return null;

    return (
        <div className="max-w-lg mx-auto px-4 py-12">
            <h1 className="text-2xl font-extrabold uppercase tracking-wide mb-8 border-b-4 border-black pb-2">
                Profile
            </h1>

            <div className="space-y-6">
                {/* Email — read only */}
                <div className="space-y-1">
                    <Label>Email</Label>
                    <p className="text-sm font-mono bg-gray-50 border border-gray-200 px-3 py-2">{user.email}</p>
                </div>

                {/* Display name */}
                <div className="space-y-1">
                    <Label htmlFor="displayName">Display Name</Label>
                    {editing ? (
                        <div className="flex gap-2">
                            <Input
                                id="displayName"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                autoFocus
                                maxLength={128}
                            />
                            <Button
                                onClick={() => updateMutation.mutate()}
                                disabled={updateMutation.isPending}
                                className="border-2 border-black rounded-none uppercase text-xs"
                            >
                                Save
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => { setEditing(false); setDisplayName(user.displayName ?? ''); }}
                                className="border-2 border-black rounded-none uppercase text-xs"
                            >
                                Cancel
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <p className="text-sm">{user.displayName || <span className="text-muted-foreground italic">Not set</span>}</p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditing(true)}
                                className="border border-black rounded-none uppercase text-xs"
                            >
                                Edit
                            </Button>
                        </div>
                    )}
                </div>

                {/* Member since */}
                {user.createdAt && (
                    <div className="space-y-1">
                        <Label>Member Since</Label>
                        <p className="text-sm text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                )}

                <div className="pt-4 border-t border-gray-200">
                    <Button
                        variant="outline"
                        onClick={logout}
                        className="border-2 border-red-500 text-red-600 rounded-none uppercase tracking-wide text-xs hover:bg-red-50"
                    >
                        Sign Out
                    </Button>
                </div>
            </div>
        </div>
    );
}
