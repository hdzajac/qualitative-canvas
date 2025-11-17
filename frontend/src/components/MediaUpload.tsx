import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadMedia, createTranscriptionJob } from '@/services/api';
import { toast } from 'sonner';

interface MediaUploadProps {
    projectId?: string;
    onUploaded?: () => void;
    label?: string;
    autoTranscribe?: boolean;
}

export const MediaUpload = ({ projectId, onUploaded, label = 'Upload audio/video', autoTranscribe = true }: MediaUploadProps) => {
    const [uploading, setUploading] = useState(false);
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
            
            // Auto-start transcription if enabled
            if (autoTranscribe && media.id) {
                try {
                    await createTranscriptionJob(media.id, {});
                    toast.success('Transcription started');
                } catch (transcribeErr) {
                    console.error('Auto-transcribe failed:', transcribeErr);
                    toast.error('Uploaded but transcription failed to start');
                }
            }
            
            onUploaded?.();
        } catch (err) {
            console.error(err);
            toast.error('Failed to upload media');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
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
        </>
    );
};
