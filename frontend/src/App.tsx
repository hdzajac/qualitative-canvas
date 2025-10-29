import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Projects from "./pages/Projects";
import Documents from "./pages/Documents";
import { getProjects } from "@/services/api";
import { useSelectedProject } from "@/hooks/useSelectedProject";
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

function RequireProject({ children }: PropsWithChildren) {
  const { data: projects, isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [selectedProjectId] = useSelectedProject();
  if (isLoading || !projects) return null;
  if (projects.length === 0) return <Navigate to="/projects" replace />;
  if (!selectedProjectId) return <Navigate to="/projects" replace />;
  return <>{children}</>;
}

function ProjectBadge() {
  const navigate = useNavigate();
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [selectedProjectId] = useSelectedProject();
  const name = useMemo(() => projects?.find(p => p.id === selectedProjectId)?.name ?? 'No project', [projects, selectedProjectId]);
  return (
    <Button variant="outline" size="sm" onClick={() => navigate('/projects')} title="Go to projects">
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
        <div className="p-3 border-b flex items-center gap-3">
          <Link to="/">Home</Link>
          <Link to="/projects">Projects</Link>
          <Link to="/documents">Documents</Link>
          <div className="ml-auto">
            <ProjectBadge />
          </div>
        </div>
        <Routes>
          <Route path="/" element={<GuardHome />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/documents" element={<RequireProject><Documents /></RequireProject>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
