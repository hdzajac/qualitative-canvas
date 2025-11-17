import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileArchive, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ImportStats {
    files: number;
    codes: number;
    themes: number;
    insights: number;
    media: number;
    segments: number;
    participants: number;
    annotations: number;
}

interface ImportDialogProps {
    onClose: () => void;
    onSuccess?: (projectId: string) => void;
}

export default function ImportDialog({ onClose, onSuccess }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [importStats, setImportStats] = useState<ImportStats | null>(null);
    const queryClient = useQueryClient();

    const importMutation = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);

            // Get API base URL
            const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;
            const BASE_URL = `${API_BASE.replace(/\/$/, '')}/api`;

            const response = await fetch(`${BASE_URL}/import/projects`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            return response.json();
        },
        onSuccess: (data) => {
            setImportStats(data.stats);
            queryClient.invalidateQueries({ queryKey: ['projects'] });

            if (onSuccess) {
                // Wait a bit to show success stats before redirecting
                setTimeout(() => {
                    onSuccess(data.projectId);
                }, 2000);
            }
        },
    });

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.zip')) {
                setSelectedFile(file);
            }
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleImport = () => {
        if (selectedFile) {
            importMutation.mutate(selectedFile);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <div className="flex items-center gap-3">
                        <FileArchive className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-semibold text-gray-900">Import Project</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {!importStats ? (
                        <>
                            {/* Instructions */}
                            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h3 className="font-medium text-blue-900 mb-2">📦 How to Import</h3>
                                <ul className="text-sm text-blue-800 space-y-1">
                                    <li>• Select a ZIP file exported from this application</li>
                                    <li>• The ZIP must contain all required CSV files in a data/ folder</li>
                                    <li>• All relationships will be preserved with new IDs</li>
                                    <li>• VTT transcript files are for reference only</li>
                                </ul>
                            </div>

                            {/* File Upload Area */}
                            <div
                                className={`
                  relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
                  ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                  ${selectedFile ? 'bg-green-50 border-green-500' : ''}
                `}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
                                <input
                                    type="file"
                                    id="file-upload"
                                    accept=".zip"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    disabled={importMutation.isPending}
                                />

                                {!selectedFile ? (
                                    <label htmlFor="file-upload" className="cursor-pointer">
                                        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                        <p className="text-lg font-medium text-gray-700 mb-2">
                                            Drop your ZIP file here or click to browse
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            Only .zip files are accepted
                                        </p>
                                    </label>
                                ) : (
                                    <div className="space-y-4">
                                        <FileArchive className="w-12 h-12 mx-auto text-green-600" />
                                        <div>
                                            <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
                                            <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                                        </div>
                                        <button
                                            onClick={() => setSelectedFile(null)}
                                            className="text-sm text-gray-600 hover:text-gray-900 underline"
                                            disabled={importMutation.isPending}
                                        >
                                            Choose different file
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Error Message */}
                            {importMutation.isError && (
                                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <h4 className="font-medium text-red-900 mb-1">Import Failed</h4>
                                        <p className="text-sm text-red-800">
                                            {importMutation.error instanceof Error
                                                ? importMutation.error.message
                                                : 'An error occurred during import. Please check the file format.'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                    disabled={importMutation.isPending}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleImport}
                                    disabled={!selectedFile || importMutation.isPending}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    {importMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Importing...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4" />
                                            Import Project
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Success State */
                        <div className="text-center py-8">
                            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-600" />
                            <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                                Import Successful!
                            </h3>
                            <p className="text-gray-600 mb-6">
                                Your project has been imported with all relationships preserved.
                            </p>

                            {/* Import Statistics */}
                            <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
                                <h4 className="font-medium text-gray-900 mb-4">Imported Data:</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {importStats.files > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Documents:</span>
                                            <span className="font-medium">{importStats.files}</span>
                                        </div>
                                    )}
                                    {importStats.codes > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Codes:</span>
                                            <span className="font-medium">{importStats.codes}</span>
                                        </div>
                                    )}
                                    {importStats.themes > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Themes:</span>
                                            <span className="font-medium">{importStats.themes}</span>
                                        </div>
                                    )}
                                    {importStats.insights > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Insights:</span>
                                            <span className="font-medium">{importStats.insights}</span>
                                        </div>
                                    )}
                                    {importStats.media > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Media Files:</span>
                                            <span className="font-medium">{importStats.media}</span>
                                        </div>
                                    )}
                                    {importStats.segments > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Segments:</span>
                                            <span className="font-medium">{importStats.segments}</span>
                                        </div>
                                    )}
                                    {importStats.participants > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Participants:</span>
                                            <span className="font-medium">{importStats.participants}</span>
                                        </div>
                                    )}
                                    {importStats.annotations > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Annotations:</span>
                                            <span className="font-medium">{importStats.annotations}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
