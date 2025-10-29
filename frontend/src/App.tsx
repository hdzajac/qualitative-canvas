import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate, Outlet } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Projects from "./pages/Projects";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import CanvasPage from "./pages/CanvasPage";
import Themes from "./pages/Themes";
import Insights from "./pages/Insights";
import { getProjects } from "@/services/api";
import { useSelectedProject } from "./hooks/useSelectedProject";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, PropsWithChildren } from "react";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="px-4 py-3 border-b-4 border-black bg-white text-black flex items-center gap-6 uppercase tracking-wide">
          <Link className="font-extrabold text-xl" to="/">Qualitative Canvas</Link>
          <nav className="flex gap-6">
            <Link className="hover:underline decoration-[3px] underline-offset-4" to="/projects">Projects</Link>
            <Link className="hover:underline decoration-[3px] underline-offset-4" to="/documents">Documents</Link>
            <Link className="hover:underline decoration-[3px] underline-offset-4" to="/themes">Themes</Link>
            <Link className="hover:underline decoration-[3px] underline-offset-4" to="/insights">Insights</Link>
            <Link className="hover:underline decoration-[3px] underline-offset-4" to="/canvas">Canvas</Link>
          </nav>
          <div className="ml-auto">
            <ProjectBadge />
          </div>
        </div>
        <Routes>
          <Route path="/" element={<GuardHome />} />
          <Route path="/projects" element={<Projects />} />
          <Route element={<RequireProject />}>
            <Route path="/documents" element={<Documents />} />
            <Route path="/documents/:id" element={<DocumentDetail />} />
            <Route path="/themes" element={<Themes />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/canvas" element={<CanvasPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
