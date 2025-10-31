import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Highlight } from '@/types';
import { createTheme } from '@/services/api';
import { toast } from 'sonner';
import { DEFAULTS } from '@/components/canvas/CanvasTypes';

interface ThemeCreatorProps {
  highlights: Highlight[];
  onThemeCreated: () => void;
}

export const ThemeCreator = ({ highlights, onThemeCreated }: ThemeCreatorProps) => {
  const [themeName, setThemeName] = useState('');
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);

  const handleToggleHighlight = (highlightId: string) => {
    setSelectedHighlights((prev) =>
      prev.includes(highlightId)
        ? prev.filter((id) => id !== highlightId)
        : [...prev, highlightId]
    );
  };

  const handleCreateTheme = async () => {
    if (!themeName.trim() || selectedHighlights.length === 0) {
      toast.error('Please provide a theme name and select at least one code');
      return;
    }

    try {
      await createTheme({
        name: themeName.trim(),
        highlightIds: selectedHighlights,
        size: DEFAULTS.theme,
      });
      toast.success('Theme created');
      setThemeName('');
      setSelectedHighlights([]);
      onThemeCreated();
    } catch (error) {
      toast.error('Failed to create theme');
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Create Theme</h3>

      <div className="space-y-4">
        <div>
          <Label htmlFor="themeName">Theme Name</Label>
          <Input
            id="themeName"
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            placeholder="Enter theme name"
          />
        </div>

        <div>
          <Label>Select Codes</Label>
          <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto">
            {highlights.length === 0 ? (
              <p className="text-sm text-muted-foreground">No codes available</p>
            ) : (
              highlights.map((highlight) => (
                <div key={highlight.id} className="flex items-start space-x-2">
                  <Checkbox
                    id={highlight.id}
                    checked={selectedHighlights.includes(highlight.id)}
                    onCheckedChange={() => handleToggleHighlight(highlight.id)}
                  />
                  <label
                    htmlFor={highlight.id}
                    className="text-sm cursor-pointer flex-1"
                  >
                    <span className="font-medium">{highlight.codeName}</span>
                    <span className="text-muted-foreground italic ml-2">
                      "{highlight.text.substring(0, 50)}..."
                    </span>
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        <Button onClick={handleCreateTheme} className="w-full">
          Create Theme
        </Button>
      </div>
    </Card>
  );
};
