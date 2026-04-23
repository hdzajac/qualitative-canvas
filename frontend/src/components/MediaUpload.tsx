import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadMedia, createTranscriptionJob } from '@/services/api';
import type { MediaFile } from '@/types';
import { toast } from 'sonner';

interface MediaUploadProps {
    projectId?: string;
    onUploaded?: () => void;
    label?: string;
    autoTranscribe?: boolean;
}

export const MediaUpload = ({ projectId, onUploaded, label = 'Upload audio/video', autoTranscribe = true }: MediaUploadProps) => {
    const [uploading, setUploading] = useState(false);
    const [starting, setStarting] = useState(false);
    const [pendingMedia, setPendingMedia] = useState<MediaFile | null>(null);
    const [numSpeakers, setNumSpeakers] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!projectId) {
            toast.error('Select a project first');
            return;
        }
        setUploading(true);
        try {
            const media = await uploadMedia(file, projectId);
            toast.success('Media uploaded');
            if (autoTranscribe && media.id) {
                // Hold upload; prompt for optional speaker count before starting transcription
                setPendingMedia(media);
                setNumSpeakers('');
            } else {
                onUploaded?.();
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to upload media');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const startTranscription = async (media: MediaFile, speakerCount: number | undefined) => {
        setStarting(true);
        try {
            await createTranscriptionJob(media.id, { numSpeakers: speakerCount });
            toast.success('Transcription started');
        } catch (err) {
            console.error('Transcription failed to start:', err);
            toast.error('Uploaded but transcription failed to start');
        } finally {
            setStarting(false);
            setPendingMedia(null);
            onUploaded?.();
        }
    };

    const handleDialogConfirm = () => {
        if (!pendingMedia) return;
        const parsed = parseInt(numSpeakers, 10);
        const speakerCount = numSpeakers.trim() !== '' && parsed >= 1 && parsed <= 20 ? parsed : undefined;
        startTranscription(pendingMedia, speakerCount);
    };

    const handleDialogSkip = () => {
        if (!pendingMedia) return;
        startTranscription(pendingMedia, undefined);
    };

    return (
        <>
            <Button type="button" disabled={uploading || !projectId} onClick={() => inputRef.current?.click()} className="brutal-button h-8 px-3">
                <Upload className="w-4 h-4 mr-2" /> {uploading ? 'Uploading…' : label}
            </Button>
            <input
                ref={inputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={handleChange}
                disabled={uploading}
            />

            <Dialog open={!!pendingMedia} onOpenChange={(open) => { if (!open && !starting) handleDialogSkip(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Start transcription</DialogTitle>
                        <DialogDescription>
                            Optionally specify how many speakers are in this recording. This helps the diarization model assign speech to the correct participants.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-2">
                        <Label htmlFor="num-speakers">Number of speakers (optional, 1–20)</Label>
                        <Input
                            id="num-speakers"
                            type="number"
                            min={1}
                            max={20}
                            placeholder="Leave blank if unknown"
                            value={numSpeakers}
                            onChange={(e) => setNumSpeakers(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleDialogConfirm(); }}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleDialogSkip} disabled={starting}>
                            Skip
                        </Button>
                        <Button onClick={handleDialogConfirm} disabled={starting}>
                            {starting ? 'Starting…' : 'Start transcription'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
