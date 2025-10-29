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

// Mock storage for development (remove when backend is ready)
const mockStorage = {
  files: [] as UploadedFile[],
  highlights: [] as Highlight[],
  themes: [] as Theme[],
  insights: [] as Insight[],
  annotations: [] as Annotation[],
};

// Load from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('qualitative-data');
  if (stored) {
    Object.assign(mockStorage, JSON.parse(stored));
  }
}

const saveMockStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('qualitative-data', JSON.stringify(mockStorage));
  }
};

// File APIs
export const uploadFile = async (filename: string, content: string): Promise<UploadedFile> => {
  // TODO: Replace with actual API call
  // const response = await fetch(`${BASE_URL}/files`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ filename, content }),
  // });
  // return response.json();
  
  const file: UploadedFile = {
    id: Date.now().toString(),
    filename,
    content,
    createdAt: new Date().toISOString(),
  };
  mockStorage.files.push(file);
  saveMockStorage();
  return file;
};

export const getFiles = async (): Promise<UploadedFile[]> => {
  // TODO: Replace with actual API call
  // const response = await fetch(`${BASE_URL}/files`);
  // return response.json();
  
  return mockStorage.files;
};

export const getFile = async (id: string): Promise<UploadedFile | null> => {
  // TODO: Replace with actual API call
  // const response = await fetch(`${BASE_URL}/files/${id}`);
  // return response.json();
  
  return mockStorage.files.find(f => f.id === id) || null;
};

// Highlight APIs
export const createHighlight = async (highlight: Omit<Highlight, 'id' | 'createdAt'>): Promise<Highlight> => {
  // TODO: Replace with actual API call
  const newHighlight: Highlight = {
    ...highlight,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  };
  mockStorage.highlights.push(newHighlight);
  saveMockStorage();
  return newHighlight;
};

export const getHighlights = async (): Promise<Highlight[]> => {
  // TODO: Replace with actual API call
  return mockStorage.highlights;
};

export const updateHighlight = async (id: string, updates: Partial<Highlight>): Promise<Highlight> => {
  // TODO: Replace with actual API call
  const index = mockStorage.highlights.findIndex(h => h.id === id);
  if (index !== -1) {
    mockStorage.highlights[index] = { ...mockStorage.highlights[index], ...updates };
    saveMockStorage();
    return mockStorage.highlights[index];
  }
  throw new Error('Highlight not found');
};

export const deleteHighlight = async (id: string): Promise<void> => {
  // TODO: Replace with actual API call
  mockStorage.highlights = mockStorage.highlights.filter(h => h.id !== id);
  saveMockStorage();
};

// Theme APIs
export const createTheme = async (theme: Omit<Theme, 'id' | 'createdAt'>): Promise<Theme> => {
  // TODO: Replace with actual API call
  const newTheme: Theme = {
    ...theme,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  };
  mockStorage.themes.push(newTheme);
  saveMockStorage();
  return newTheme;
};

export const getThemes = async (): Promise<Theme[]> => {
  // TODO: Replace with actual API call
  return mockStorage.themes;
};

export const updateTheme = async (id: string, updates: Partial<Theme>): Promise<Theme> => {
  // TODO: Replace with actual API call
  const index = mockStorage.themes.findIndex(t => t.id === id);
  if (index !== -1) {
    mockStorage.themes[index] = { ...mockStorage.themes[index], ...updates };
    saveMockStorage();
    return mockStorage.themes[index];
  }
  throw new Error('Theme not found');
};

export const deleteTheme = async (id: string): Promise<void> => {
  // TODO: Replace with actual API call
  mockStorage.themes = mockStorage.themes.filter(t => t.id !== id);
  saveMockStorage();
};

// Insight APIs
export const createInsight = async (insight: Omit<Insight, 'id' | 'createdAt'>): Promise<Insight> => {
  // TODO: Replace with actual API call
  const newInsight: Insight = {
    ...insight,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  };
  mockStorage.insights.push(newInsight);
  saveMockStorage();
  return newInsight;
};

export const getInsights = async (): Promise<Insight[]> => {
  // TODO: Replace with actual API call
  return mockStorage.insights;
};

export const updateInsight = async (id: string, updates: Partial<Insight>): Promise<Insight> => {
  // TODO: Replace with actual API call
  const index = mockStorage.insights.findIndex(i => i.id === id);
  if (index !== -1) {
    mockStorage.insights[index] = { ...mockStorage.insights[index], ...updates };
    saveMockStorage();
    return mockStorage.insights[index];
  }
  throw new Error('Insight not found');
};

export const deleteInsight = async (id: string): Promise<void> => {
  // TODO: Replace with actual API call
  mockStorage.insights = mockStorage.insights.filter(i => i.id !== id);
  saveMockStorage();
};

// Annotation APIs
export const createAnnotation = async (annotation: Omit<Annotation, 'id' | 'createdAt'>): Promise<Annotation> => {
  // TODO: Replace with actual API call
  const newAnnotation: Annotation = {
    ...annotation,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  };
  mockStorage.annotations.push(newAnnotation);
  saveMockStorage();
  return newAnnotation;
};

export const getAnnotations = async (): Promise<Annotation[]> => {
  // TODO: Replace with actual API call
  return mockStorage.annotations;
};

export const updateAnnotation = async (id: string, updates: Partial<Annotation>): Promise<Annotation> => {
  // TODO: Replace with actual API call
  const index = mockStorage.annotations.findIndex(a => a.id === id);
  if (index !== -1) {
    mockStorage.annotations[index] = { ...mockStorage.annotations[index], ...updates };
    saveMockStorage();
    return mockStorage.annotations[index];
  }
  throw new Error('Annotation not found');
};

export const deleteAnnotation = async (id: string): Promise<void> => {
  // TODO: Replace with actual API call
  mockStorage.annotations = mockStorage.annotations.filter(a => a.id !== id);
  saveMockStorage();
};
