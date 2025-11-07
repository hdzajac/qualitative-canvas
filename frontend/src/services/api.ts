import type { UploadedFile, Highlight, Theme, Insight, Annotation, Project, MediaFile, TranscriptSegment, TranscriptionJob } from '@/types';

/**
 * API Service Layer
 * 
 * This file contains all API endpoint calls that need to be implemented in your backend.
 * Replace the BASE_URL with your Node.js server URL when ready.
 * 
 * Backend Endpoints to Implement:
 * 
 * POST   /api/files              - Upload a file
 * GET    /api/files              - Get all files
 * GET    /api/files/:id          - Get a specific file
 * 
 * POST   /api/highlights         - Create a highlight
 * GET    /api/highlights         - Get all highlights
 * PUT    /api/highlights/:id     - Update a highlight
 * DELETE /api/highlights/:id     - Delete a highlight
 * 
 * POST   /api/themes             - Create a theme
 * GET    /api/themes             - Get all themes
 * PUT    /api/themes/:id         - Update a theme
 * DELETE /api/themes/:id         - Delete a theme
 * 
 * POST   /api/insights           - Create an insight
 * GET    /api/insights           - Get all insights
 * PUT    /api/insights/:id       - Update an insight
 * DELETE /api/insights/:id       - Delete an insight
 * 
 * POST   /api/annotations        - Create an annotation
 * GET    /api/annotations        - Get all annotations
 * PUT    /api/annotations/:id    - Update an annotation
 * DELETE /api/annotations/:id    - Delete an annotation
 * 
 * POST   /api/projects           - Create a project
 * GET    /api/projects           - Get all projects
 * PUT    /api/projects/:id       - Update a project
 * DELETE /api/projects/:id       - Delete a project
 */

// Update: use Vite env for API base URL in Docker or local dev
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  || (typeof window !== 'undefined' ? `${window.location.origin}` : 'http://localhost:5000');
const BASE_URL = `${API_BASE.replace(/\/$/, '')}/api`;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// Files
export const uploadFile = (filename: string, content: string, projectId?: string): Promise<UploadedFile> =>
  http<UploadedFile>('/files', { method: 'POST', body: JSON.stringify({ filename, content, projectId }) });

export const getFiles = (projectId?: string): Promise<UploadedFile[]> =>
  http<UploadedFile[]>(projectId ? `/files?projectId=${encodeURIComponent(projectId)}` : '/files');

export const getFile = (id: string): Promise<UploadedFile> => http<UploadedFile>(`/files/${id}`);

export const updateFile = (id: string, updates: Partial<UploadedFile>): Promise<UploadedFile> =>
  http<UploadedFile>(`/files/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteFile = (id: string): Promise<void> =>
  http<void>(`/files/${id}`, { method: 'DELETE' });

// Highlights (Codes)
export const createHighlight = (highlight: Omit<Highlight, 'id' | 'createdAt'>): Promise<Highlight> =>
  http<Highlight>('/codes', { method: 'POST', body: JSON.stringify(highlight) });

export const getHighlights = (params?: { fileId?: string; projectId?: string }): Promise<Highlight[]> => {
  const qs = params?.fileId
    ? `?fileId=${encodeURIComponent(params.fileId)}`
    : params?.projectId
    ? `?projectId=${encodeURIComponent(params.projectId)}`
    : '';
  return http<Highlight[]>(`/codes${qs}`);
};

export const updateHighlight = (id: string, updates: Partial<Highlight>): Promise<Highlight> =>
  http<Highlight>(`/codes/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteHighlight = (id: string): Promise<void> =>
  http<void>(`/codes/${id}`, { method: 'DELETE' });

// Themes
export const createTheme = (theme: Omit<Theme, 'id' | 'createdAt'>): Promise<Theme> =>
  http<Theme>('/themes', { method: 'POST', body: JSON.stringify(theme) });

export const getThemes = (projectId?: string): Promise<Theme[]> =>
  http<Theme[]>(projectId ? `/themes?projectId=${encodeURIComponent(projectId)}` : '/themes');

export const updateTheme = (id: string, updates: Partial<Theme>): Promise<Theme> =>
  http<Theme>(`/themes/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteTheme = (id: string): Promise<void> =>
  http<void>(`/themes/${id}`, { method: 'DELETE' });

// Insights
export const createInsight = (insight: Omit<Insight, 'id' | 'createdAt'>): Promise<Insight> =>
  http<Insight>('/insights', { method: 'POST', body: JSON.stringify(insight) });

export const getInsights = (projectId?: string): Promise<Insight[]> =>
  http<Insight[]>(projectId ? `/insights?projectId=${encodeURIComponent(projectId)}` : '/insights');

export const updateInsight = (id: string, updates: Partial<Insight>): Promise<Insight> =>
  http<Insight>(`/insights/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteInsight = (id: string): Promise<void> =>
  http<void>(`/insights/${id}`, { method: 'DELETE' });

// Annotations
export const createAnnotation = (annotation: Omit<Annotation, 'id' | 'createdAt'>): Promise<Annotation> =>
  http<Annotation>('/annotations', { method: 'POST', body: JSON.stringify(annotation) });

export const getAnnotations = (projectId?: string): Promise<Annotation[]> =>
  http<Annotation[]>(projectId ? `/annotations?projectId=${encodeURIComponent(projectId)}` : '/annotations');

export const updateAnnotation = (id: string, updates: Partial<Annotation>): Promise<Annotation> =>
  http<Annotation>(`/annotations/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteAnnotation = (id: string): Promise<void> =>
  http<void>(`/annotations/${id}`, { method: 'DELETE' });

// Projects
export interface ProjectInput { name: string; description?: string }
export const getProjects = (): Promise<Project[]> => http<Project[]>('/projects');
export const createProject = (data: ProjectInput): Promise<Project> => http<Project>('/projects', { method: 'POST', body: JSON.stringify(data) });
export const updateProject = (id: string, data: Partial<ProjectInput>): Promise<Project> => http<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProject = (id: string): Promise<void> => http<void>(`/projects/${id}`, { method: 'DELETE' });

// Media
export const listMedia = (projectId?: string): Promise<MediaFile[]> =>
  http<MediaFile[]>(projectId ? `/media?projectId=${encodeURIComponent(projectId)}` : '/media');

export const getMedia = (id: string): Promise<MediaFile> => http<MediaFile>(`/media/${id}`);

export async function uploadMedia(file: File, projectId?: string): Promise<MediaFile> {
  const form = new FormData();
  form.append('file', file);
  if (projectId) form.append('projectId', projectId);
  const res = await fetch(`${BASE_URL}/media`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Transcription jobs
export const createTranscriptionJob = (mediaId: string, opts: { model?: string; languageHint?: string } = {}): Promise<TranscriptionJob> =>
  http<TranscriptionJob>(`/media/${mediaId}/transcribe`, { method: 'POST', body: JSON.stringify(opts) });

export const getTranscriptionJob = (jobId: string): Promise<TranscriptionJob> => http<TranscriptionJob>(`/transcribe-jobs/${jobId}`);

// Segments
export const listSegments = (mediaId: string): Promise<TranscriptSegment[]> =>
  http<TranscriptSegment[]>(`/media/${mediaId}/segments`);

export const updateSegment = (mediaId: string, segmentId: string, payload: { text?: string; participantId?: string | null }): Promise<TranscriptSegment> =>
  http<TranscriptSegment>(`/media/${mediaId}/segments/${segmentId}`, { method: 'PUT', body: JSON.stringify(payload) });
