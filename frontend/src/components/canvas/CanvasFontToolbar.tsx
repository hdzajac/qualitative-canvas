import React from 'react';
import { Button } from '@/components/ui/button';
import { Text as TextSizeIcon } from 'lucide-react';

export type CanvasFontToolbarProps = {
  fontSize: number;
  onChangeFontSize: (v: number) => void;
  canApply: boolean;
  onApply: () => void;
};

export const CanvasFontToolbar: React.FC<CanvasFontToolbarProps> = ({ fontSize, onChangeFontSize, canApply, onApply }) => {
  return (
    <div className="absolute z-20 top-3 left-1/2 -translate-x-1/2 bg-white border-2 border-black px-2 py-1 flex items-center gap-2">
      <TextSizeIcon className="w-4 h-4" />
      <select className="text-sm outline-none" value={fontSize} onChange={(e) => onChangeFontSize(parseInt(e.target.value) || 12)}>
        {[10, 12, 14, 16, 18, 20, 24].map(sz => <option key={sz} value={sz}>{sz}px</option>)}
      </select>
      {canApply ? <Button size="sm" className="brutal-button" onClick={onApply}>Apply</Button> : null}
    </div>
  );
};

export default CanvasFontToolbar;
