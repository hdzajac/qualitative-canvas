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

// Improved WebVTT -> plain text converter that preserves speakers and groups consecutive cues
function parseVttToText(raw: string): string {
  const lines = raw.replace(/\uFEFF/g, '').split(/\r?\n/);
  const blockStarts = new Set(['WEBVTT', 'STYLE', 'REGION', 'NOTE']);

  type Cue = { startSec: number; id?: string; text: string };
  const cues: Cue[] = [];

  const parseTimeToSeconds = (ts: string): number => {
    const t = ts.trim();
    const parts = t.split(':');
    let h = 0, m = 0, s = 0;
    if (parts.length === 3) { h = parseInt(parts[0], 10) || 0; m = parseInt(parts[1], 10) || 0; s = parseFloat(parts[2]) || 0; }
    else if (parts.length === 2) { m = parseInt(parts[0], 10) || 0; s = parseFloat(parts[1]) || 0; }
    return h * 3600 + m * 60 + s;
  };
  const formatHHMMSS = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  // Scan through lines and build cues {startSec, id, text}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Skip header/blocks (NOTE/STYLE/REGION) until blank line
    const firstToken = trimmed.split(/\s+/)[0];
    if (blockStarts.has(firstToken)) {
      // Skip current line and subsequent until blank
      while (i + 1 < lines.length && lines[i + 1].trim() !== '') i++;
      continue;
    }

    let idLine: string | undefined;
    let tsLine = trimmed;

    // Identifier line may precede timestamp
    if (!tsLine.includes('-->')) {
      const next = lines[i + 1]?.trim() || '';
      if (next.includes('-->')) {
        idLine = trimmed;
        i++;
        tsLine = next;
      } else {
        // Not a timestamp or id for a cue, skip
        continue;
      }
    }

    // Extract start timestamp from tsLine
    const tsMatch = tsLine.match(/(\d{1,2}:)?\d{2}:\d{2}\.\d{3}/);
    if (!tsMatch) continue;
    const startStr = tsMatch[0];
    const startSec = parseTimeToSeconds(startStr);

    // Collect cue text lines until blank line
    const textLines: string[] = [];
    while (i + 1 < lines.length) {
      const peek = lines[i + 1];
      if (peek.trim() === '') { i++; break; }
      // Stop if we encounter a new timestamp without a separating blank (rare)
      if (peek.includes('-->')) break;
      textLines.push(peek.trimEnd());
      i++;
    }
    const textRaw = textLines.join(' ').trim();
    cues.push({ startSec, id: idLine, text: textRaw });
  }

  // Extract speaker and clean text
  type Block = { speaker: string | null; speakerKey: string; startSec: number; text: string };
  const blocks: Block[] = [];

  const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

  for (const cue of cues) {
    let speaker: string | null = null;
    let text = cue.text;

    // Voice tag: <v Speaker>Text</v>
    const voice = text.match(/<v\s+([^>]+)>([\s\S]*)/i);
    if (voice) {
      speaker = voice[1].trim();
      text = voice[2].replace(/<\/v>/gi, '').trim();
    } else {
      // "Name: content" pattern
      const m = text.match(/^([A-Za-z][\w .'-]{0,50}):\s*(.+)$/);
      if (m) {
        speaker = m[1].trim();
        text = m[2].trim();
      } else if (cue.id && /[A-Za-z]/.test(cue.id)) {
        // Fallback to identifier line if it looks like a name
        speaker = cue.id.trim();
      }
    }

    text = stripTags(text).replace(/\s+/g, ' ').trim();
    const speakerKey = (speaker || '').toLowerCase();

    // Group consecutive cues by the same speaker
    const last = blocks[blocks.length - 1];
    if (last && last.speakerKey === speakerKey) {
      last.text += (last.text ? ' ' : '') + text;
    } else {
      blocks.push({ speaker, speakerKey, startSec: cue.startSec, text });
    }
  }

  // Format output: each block starts with HH:MM:SS and speaker label if present
  const out: string[] = [];
  for (const b of blocks) {
    const stamp = formatHHMMSS(b.startSec);
    if (b.speaker) out.push(`${stamp} ${b.speaker}: ${b.text}`);
    else out.push(`${stamp} ${b.text}`);
  }

  return out.join('\n');
}

export const FileUpload = ({ onFileUploaded, projectId, renderAs = 'card' }: FileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    const isTxt = lower.endsWith('.txt');
    const isVtt = lower.endsWith('.vtt');
    if (!isTxt && !isVtt) {
      toast.error('Please upload a .txt or .vtt file');
      return;
    }

    setUploading(true);
    try {
      const raw = await file.text();
      const content = isVtt ? parseVttToText(raw) : raw;
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
          <Upload className="w-4 h-4 mr-2" /> {uploading ? 'Uploading...' : 'Upload .txt/.vtt'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.vtt,text/vtt"
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
        <h3 className="text-base font-semibold mb-1">Upload Transcript (.txt or .vtt)</h3>
        <p className="text-xs text-muted-foreground mb-3">Select a .txt or .vtt file to add as a document</p>
        <Button type="button" disabled={uploading} onClick={handleButtonClick} className="brutal-button">
          {uploading ? 'Uploading...' : 'Select File'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.vtt,text/vtt"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
      </div>
    </Card>
  );
};
