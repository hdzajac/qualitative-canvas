import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            navigate(from, { replace: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
            <div className="w-full max-w-sm border-4 border-black p-8">
                <h1 className="text-2xl font-extrabold uppercase tracking-wide mb-6">Log In</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="email">Email</Label>
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
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
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
                        {loading ? 'Logging in…' : 'Log In'}
                    </Button>
                </form>
                <p className="mt-6 text-sm text-center">
                    No account?{' '}
                    <Link to="/signup" className="underline font-medium">
                        Create one
                    </Link>
                </p>
            </div>
        </div>
    );
}
