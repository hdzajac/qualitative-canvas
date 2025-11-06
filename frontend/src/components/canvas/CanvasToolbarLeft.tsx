import React from 'react';
import { Button } from '@/components/ui/button';
import { MousePointer2, Hand, Type as TypeIcon } from 'lucide-react';
import type { Tool } from './CanvasTypes';

export type CanvasToolbarLeftProps = {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  onFit: () => void;
};

export const CanvasToolbarLeft: React.FC<CanvasToolbarLeftProps> = ({ tool, onSetTool, onFit }) => {
  return (
    <div className="absolute left-3 top-20 z-20 flex flex-col gap-2">
      <Button size="icon" variant={tool === 'select' ? 'default' : 'outline'} className="rounded-none" onClick={() => onSetTool('select')} title="Select (V)">
        <MousePointer2 className="w-4 h-4" />
      </Button>
      <Button size="icon" variant={tool === 'hand' ? 'default' : 'outline'} className="rounded-none" onClick={() => onSetTool('hand')} title="Pan (Space)">
        <Hand className="w-4 h-4" />
      </Button>
      <Button size="icon" variant={tool === 'text' ? 'default' : 'outline'} className="rounded-none" onClick={() => onSetTool('text')} title="Text (T)">
        <TypeIcon className="w-4 h-4" />
      </Button>
      <Button size="sm" variant="outline" className="rounded-none" onClick={onFit} title="Fit to content">
        Fit
      </Button>
    </div>
  );
};

export default CanvasToolbarLeft;
