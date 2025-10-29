import type { UploadedFile, Highlight, Theme, Insight, Annotation } from '@/types';

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
export const uploadFile = (filename: string, content: string): Promise<UploadedFile> =>
  http<UploadedFile>('/files', { method: 'POST', body: JSON.stringify({ filename, content }) });

export const getFiles = (): Promise<UploadedFile[]> => http<UploadedFile[]>('/files');

export const getFile = (id: string): Promise<UploadedFile> => http<UploadedFile>(`/files/${id}`);

// Highlights
export const createHighlight = (highlight: Omit<Highlight, 'id' | 'createdAt'>): Promise<Highlight> =>
  http<Highlight>('/highlights', { method: 'POST', body: JSON.stringify(highlight) });

export const getHighlights = (): Promise<Highlight[]> => http<Highlight[]>('/highlights');

export const updateHighlight = (id: string, updates: Partial<Highlight>): Promise<Highlight> =>
  http<Highlight>(`/highlights/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteHighlight = (id: string): Promise<void> =>
  http<void>(`/highlights/${id}`, { method: 'DELETE' });

// Themes
export const createTheme = (theme: Omit<Theme, 'id' | 'createdAt'>): Promise<Theme> =>
  http<Theme>('/themes', { method: 'POST', body: JSON.stringify(theme) });

export const getThemes = (): Promise<Theme[]> => http<Theme[]>('/themes');

export const updateTheme = (id: string, updates: Partial<Theme>): Promise<Theme> =>
  http<Theme>(`/themes/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteTheme = (id: string): Promise<void> =>
  http<void>(`/themes/${id}`, { method: 'DELETE' });

// Insights
export const createInsight = (insight: Omit<Insight, 'id' | 'createdAt'>): Promise<Insight> =>
  http<Insight>('/insights', { method: 'POST', body: JSON.stringify(insight) });

export const getInsights = (): Promise<Insight[]> => http<Insight[]>('/insights');

export const updateInsight = (id: string, updates: Partial<Insight>): Promise<Insight> =>
  http<Insight>(`/insights/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteInsight = (id: string): Promise<void> =>
  http<void>(`/insights/${id}`, { method: 'DELETE' });

// Annotations
export const createAnnotation = (annotation: Omit<Annotation, 'id' | 'createdAt'>): Promise<Annotation> =>
  http<Annotation>('/annotations', { method: 'POST', body: JSON.stringify(annotation) });

export const getAnnotations = (): Promise<Annotation[]> => http<Annotation[]>('/annotations');

export const updateAnnotation = (id: string, updates: Partial<Annotation>): Promise<Annotation> =>
  http<Annotation>(`/annotations/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteAnnotation = (id: string): Promise<void> =>
  http<void>(`/annotations/${id}`, { method: 'DELETE' });
