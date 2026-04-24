import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authSignup } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SignupPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();

    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await authSignup(email, password, displayName || undefined);
            await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
            navigate('/', { replace: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Signup failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
            <div className="w-full max-w-sm border-4 border-black p-8">
                <h1 className="text-2xl font-extrabold uppercase tracking-wide mb-6">Create Account</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="email">Email <span className="text-muted-foreground text-xs">(must be @ku.dk)</span></Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@ku.dk"
                            autoComplete="email"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="displayName">Display Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input
                            id="displayName"
                            type="text"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            placeholder="Your name"
                            autoComplete="name"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="password">Password <span className="text-muted-foreground text-xs">(min. 8 characters)</span></Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            required
                            minLength={8}
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-red-600 border border-red-300 bg-red-50 px-3 py-2" role="alert">
                            {error}
                        </p>
                    )}
                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full border-2 border-black rounded-none uppercase tracking-wide bg-black text-white hover:bg-gray-900"
                    >
                        {loading ? 'Creating account…' : 'Create Account'}
                    </Button>
                </form>
                <p className="mt-6 text-sm text-center">
                    Already have an account?{' '}
                    <Link to="/login" className="underline font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
