import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { uploadFile } from '@/services/api';
import { toast } from 'sonner';

interface FileUploadProps {
  onFileUploaded: (fileId: string) => void;
}

export const FileUpload = ({ onFileUploaded }: FileUploadProps) => {
  const [uploading, setUploading] = useState(false);

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
      const uploadedFile = await uploadFile(file.name, content);
      toast.success('File uploaded successfully');
      onFileUploaded(uploadedFile.id);
    } catch (error) {
      toast.error('Failed to upload file');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleButtonClick = () => {
    document.getElementById('file-input')?.click();
  };

  return (
    <Card className="p-8 border-2 border-dashed border-border hover:border-primary transition-colors">
      <div className="flex flex-col items-center justify-center">
        <Upload className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Upload Transcript</h3>
        <p className="text-sm text-muted-foreground mb-4">Click to select a .txt file</p>
        <Button type="button" disabled={uploading} onClick={handleButtonClick}>
          {uploading ? 'Uploading...' : 'Select File'}
        </Button>
        <input
          id="file-input"
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
