/**
 * ExportDialog Component
 * Provides UI for exporting project data as CSV files in a ZIP archive
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ExportDialogProps {
    projectId: string;
    projectName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ projectId, projectName, open, onOpenChange }: ExportDialogProps) {
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await fetch(
                `/api/export/projects/${projectId}/export?format=zip`,
                { method: 'GET' }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Export failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_export_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success('Project exported successfully');
            onOpenChange(false);
        } catch (error) {
            console.error('Export error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to export project');
        } finally {
            setExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Export Project</DialogTitle>
                    <DialogDescription>
                        Export all project data as CSV files in a ZIP archive.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <p className="text-sm text-muted-foreground">
                        Export your complete project in a single ZIP file. Perfect for backup, analysis in external tools, or future reimport.
                    </p>

                    <div className="rounded-lg border p-4 bg-muted/50">
                        <h4 className="font-medium text-sm mb-2">Complete package includes:</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li className="flex items-start">
                                <span className="mr-2">📊</span>
                                <span><strong>CSV data files:</strong> All codes, themes, insights, and annotations</span>
                            </li>
                            <li className="flex items-start">
                                <span className="mr-2">📄</span>
                                <span><strong>Document content:</strong> Full text of all uploaded documents</span>
                            </li>
                            <li className="flex items-start">
                                <span className="mr-2">🎙️</span>
                                <span><strong>VTT transcripts:</strong> Ready for video players and subtitle editors</span>
                            </li>
                            <li className="flex items-start">
                                <span className="mr-2">👥</span>
                                <span><strong>Participant data:</strong> Speaker names and assignments</span>
                            </li>
                            <li className="flex items-start">
                                <span className="mr-2">🔗</span>
                                <span><strong>All relationships:</strong> Preserved for perfect reimport</span>
                            </li>
                        </ul>
                    </div>

                    <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                        <strong className="text-amber-900 dark:text-amber-100">💡 Use cases:</strong>
                        <span className="ml-1 text-amber-800 dark:text-amber-200 block mt-1">
                            Analyze in Excel/R/SPSS • Archive projects • Share with collaborators • Reimport later (future feature)
                        </span>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
                        Cancel
                    </Button>
                    <Button onClick={handleExport} disabled={exporting}>
                        <Download className="w-4 h-4 mr-2" />
                        {exporting ? 'Exporting...' : 'Export as ZIP'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
