import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Annotation } from '@/types';
import { updateAnnotation, deleteAnnotation } from '@/services/api';
import { toast } from 'sonner';
import { Trash2, Check } from 'lucide-react';

interface AnnotationNodeProps {
  data: {
    annotation: Annotation;
    onUpdate: () => void;
  };
}

export const AnnotationNode = ({ data }: AnnotationNodeProps) => {
  const { annotation, onUpdate } = data;
  const [content, setContent] = useState(annotation.content);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async () => {
    try {
      await updateAnnotation(annotation.id, { content });
      toast.success('Note updated');
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      toast.error('Failed to update note');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAnnotation(annotation.id);
      toast.success('Note deleted');
      onUpdate();
    } catch (error) {
      toast.error('Failed to delete note');
    }
  };

  return (
    <div className="min-w-[200px] max-w-[250px]">
      <Card className="p-3 bg-yellow-50 dark:bg-yellow-900/20 shadow-md border border-yellow-200 dark:border-yellow-800">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[80px] text-xs bg-transparent border-none focus-visible:ring-0"
              placeholder="Type your note..."
            />
            <div className="flex gap-1">
              <Button size="sm" onClick={handleSave} className="h-7 text-xs flex-1">
                <Check className="w-3 h-3 mr-1" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="h-7 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p
              className="text-xs whitespace-pre-wrap cursor-pointer"
              onClick={() => setIsEditing(true)}
            >
              {content || 'Click to edit...'}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
