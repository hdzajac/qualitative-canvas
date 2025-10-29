import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { uploadFile } from '@/services/api';
import { toast } from 'sonner';

interface FileUploadProps {
  onFileUploaded: (fileId: string) => void;
  projectId?: string;
  renderAs?: 'card' | 'button';
}

export const FileUpload = ({ onFileUploaded, projectId, renderAs = 'card' }: FileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      toast.error('Please upload a .txt file');
      return;
    }

    setUploading(true);
    try {
      const content = await file.text();
      const uploadedFile = await uploadFile(file.name, content, projectId);
      toast.success('File uploaded successfully');
      onFileUploaded(uploadedFile.id);
    } catch (error) {
      toast.error('Failed to upload file');
      console.error(error);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  if (renderAs === 'button') {
    return (
      <>
        <Button type="button" disabled={uploading || !projectId} onClick={handleButtonClick} className="brutal-button h-8 px-3">
          <Upload className="w-4 h-4 mr-2" /> {uploading ? 'Uploading...' : 'Upload .txt'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
      </>
    );
  }

  return (
    <Card className="p-6 border-2 border-dashed border-border hover:border-primary transition-colors">
      <div className="flex flex-col items-center justify-center">
        <Upload className="w-8 h-8 text-muted-foreground mb-3" />
        <h3 className="text-base font-semibold mb-1">Upload Transcript (.txt)</h3>
        <p className="text-xs text-muted-foreground mb-3">Select a .txt file to add as a document</p>
        <Button type="button" disabled={uploading} onClick={handleButtonClick} className="brutal-button">
          {uploading ? 'Uploading...' : 'Select File'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
      </div>
    </Card>
  );
};
