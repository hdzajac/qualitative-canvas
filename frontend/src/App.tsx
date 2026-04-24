import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate, Outlet, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Projects from "./pages/Projects";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import CanvasPage from "./pages/CanvasPage";
import CanvasV2Page from "./pages/CanvasV2Page";
import Themes from "./pages/Themes";
import Insights from "./pages/Insights";
import CodesPage from "./pages/Codes";
import Analysis from "./pages/Analysis";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ProfilePage from "./pages/ProfilePage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import { getProjects } from "@/services/api";
import { useSelectedProject } from "./hooks/useSelectedProject";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect, useMemo } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import { User } from "lucide-react";

function GuardHome() {
  const navigate = useNavigate();
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [selectedProjectId] = useSelectedProject();

  useEffect(() => {
    if (!projects) return; // loading
    if (projects.length === 0) {
      navigate('/projects', { replace: true });
      return;
    }
    if (!selectedProjectId) {
      navigate('/projects', { replace: true });
      return;
    }
    navigate('/documents', { replace: true });
  }, [projects, selectedProjectId, navigate]);

  return null;
}

function RequireProject() {
  const { data: projects, isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [selectedProjectId] = useSelectedProject();
  if (isLoading || !projects) return null;
  if (projects.length === 0) return <Navigate to="/projects" replace />;
  if (!selectedProjectId) return <Navigate to="/projects" replace />;
  return <Outlet />;
}

function ProjectBadge() {
  const navigate = useNavigate();
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [selectedProjectId] = useSelectedProject();
  const name = useMemo(() => projects?.find(p => p.id === selectedProjectId)?.name ?? 'No project', [projects, selectedProjectId]);
  return (
    <Button className="border-2 border-black rounded-none uppercase tracking-wide" variant="outline" size="sm" onClick={() => navigate('/projects')} title="Go to projects">
      Project: {name}
    </Button>
  );
}

const queryClient = new QueryClient();

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const label = user.displayName ?? user.email.split('@')[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-2 border-black rounded-none uppercase tracking-wide flex items-center gap-1">
          <User size={14} />
          <span className="max-w-[120px] truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-none border-2 border-black">
        <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer uppercase text-xs tracking-wide">
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
          className="cursor-pointer uppercase text-xs tracking-wide text-red-600"
        >
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar() {
  const location = useLocation();
  const active = (path: string) => location.pathname.startsWith(path) ? 'underline decoration-[3px] underline-offset-4' : 'hover:underline decoration-[3px] underline-offset-4';
  return (
    <div className="sticky top-0 z-50 px-4 py-3 border-b-4 border-black bg-white text-black flex items-center gap-6 uppercase tracking-wide">
      <Link className="font-extrabold text-xl" to="/">Qualitative Canvas</Link>
      <nav className="flex gap-6">
        <Link className={active('/projects')} to="/projects">Projects</Link>
        <Link className={active('/documents')} to="/documents">Documents</Link>
        <Link className={active('/analysis')} to="/analysis">Analysis</Link>
        <Link className={active('/canvas')} to="/canvas">Canvas</Link>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <ProjectBadge />
        <UserMenu />
      </div>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isPublic = location.pathname === '/login' || location.pathname === '/signup';
  return (
    <>
      {!isPublic && <TopBar />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<RequireAuth><GuardHome /></RequireAuth>} />
        <Route path="/projects" element={<RequireAuth><ErrorBoundary><Projects /></ErrorBoundary></RequireAuth>} />
        <Route path="/projects/:id" element={<RequireAuth><ErrorBoundary><ProjectDetailPage /></ErrorBoundary></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route element={<RequireAuth><Outlet /></RequireAuth>}>
          <Route element={<RequireProject />}>
            <Route path="/documents" element={<ErrorBoundary><Documents /></ErrorBoundary>} />
            <Route path="/documents/:id" element={<ErrorBoundary><DocumentDetail /></ErrorBoundary>} />
            <Route path="/codes" element={<ErrorBoundary><CodesPage /></ErrorBoundary>} />
            <Route path="/themes" element={<ErrorBoundary><Themes /></ErrorBoundary>} />
            <Route path="/insights" element={<ErrorBoundary><Insights /></ErrorBoundary>} />
            <Route path="/analysis" element={<ErrorBoundary><Analysis /></ErrorBoundary>} />
            <Route path="/canvas" element={<ErrorBoundary><CanvasV2Page /></ErrorBoundary>} />
            <Route path="/canvas-legacy" element={<ErrorBoundary><CanvasPage /></ErrorBoundary>} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
