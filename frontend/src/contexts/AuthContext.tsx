import { createContext, useContext, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authMe, authLogin, authLogout, type AuthUser } from '@/services/api';

interface AuthContextValue {
    user: AuthUser | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const qc = useQueryClient();

    const { data: user = null, isLoading } = useQuery<AuthUser | null>({
        queryKey: ['auth', 'me'],
        queryFn: async () => {
            try {
                return await authMe();
            } catch {
                return null;
            }
        },
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    const login = useCallback(async (email: string, password: string) => {
        await authLogin(email, password);
        await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    }, [qc]);

    const logout = useCallback(async () => {
        await authLogout();
        qc.clear();
    }, [qc]);

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
