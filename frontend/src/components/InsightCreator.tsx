import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Theme } from '@/types';
import { createInsight } from '@/services/api';
import { toast } from 'sonner';

interface InsightCreatorProps {
  themes: Theme[];
  onInsightCreated: () => void;
}

export const InsightCreator = ({ themes, onInsightCreated }: InsightCreatorProps) => {
  const [insightName, setInsightName] = useState('');
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

  const handleToggleTheme = (themeId: string) => {
    setSelectedThemes((prev) =>
      prev.includes(themeId)
        ? prev.filter((id) => id !== themeId)
        : [...prev, themeId]
    );
  };

  const handleCreateInsight = async () => {
    if (!insightName.trim() || selectedThemes.length === 0) {
      toast.error('Please provide an insight name and select at least one theme');
      return;
    }

    try {
      await createInsight({
        name: insightName.trim(),
        themeIds: selectedThemes,
      });
      toast.success('Insight created');
      setInsightName('');
      setSelectedThemes([]);
      onInsightCreated();
    } catch (error) {
      toast.error('Failed to create insight');
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Create Insight</h3>

      <div className="space-y-4">
        <div>
          <Label htmlFor="insightName">Insight Name</Label>
          <Input
            id="insightName"
            value={insightName}
            onChange={(e) => setInsightName(e.target.value)}
            placeholder="Enter insight name"
          />
        </div>

        <div>
          <Label>Select Themes</Label>
          <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto">
            {themes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No themes available</p>
            ) : (
              themes.map((theme) => (
                <div key={theme.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={theme.id}
                    checked={selectedThemes.includes(theme.id)}
                    onCheckedChange={() => handleToggleTheme(theme.id)}
                  />
                  <label
                    htmlFor={theme.id}
                    className="text-sm cursor-pointer flex-1"
                  >
                    <span className="font-medium">{theme.name}</span>
                    <span className="text-muted-foreground ml-2">
                      ({theme.highlightIds.length} codes)
                    </span>
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        <Button onClick={handleCreateInsight} className="w-full">
          Create Insight
        </Button>
      </div>
    </Card>
  );
};
