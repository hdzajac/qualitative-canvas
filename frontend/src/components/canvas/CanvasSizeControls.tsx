import React from 'react';
import { Button } from '@/components/ui/button';

export type CanvasSizeControlsProps = {
  widthVariant: '200' | '300' | null;
  onSetWidth200: () => void;
  onSetWidth300: () => void;
  fontSize: number;
  onChangeFontSize: (v: number) => void;
  onSave: () => void;
};

export const CanvasSizeControls: React.FC<CanvasSizeControlsProps> = ({ widthVariant, onSetWidth200, onSetWidth300, fontSize, onChangeFontSize, onSave }) => {
  if (!widthVariant) return null;
  return (
    <div className="absolute right-3 top-3 z-20 bg-white border-2 border-black p-2 flex items-center gap-2">
      <span className="text-xs">Width</span>
      <Button size="sm" variant={widthVariant === '200' ? 'default' : 'outline'} className="rounded-none h-6 px-2" onClick={onSetWidth200}>200</Button>
      <Button size="sm" variant={widthVariant === '300' ? 'default' : 'outline'} className="rounded-none h-6 px-2" onClick={onSetWidth300}>300</Button>
      <span className="text-xs ml-2">Text</span>
      <select className="text-xs border border-black px-1 py-0.5" value={fontSize} onChange={(e) => onChangeFontSize(parseInt(e.target.value) || 12)}>
        {[10, 12, 14, 16, 18, 20, 24].map(s => <option key={s} value={s}>{s}px</option>)}
      </select>
      <Button size="sm" className="brutal-button" onClick={onSave}>Save</Button>
    </div>
  );
};

export default CanvasSizeControls;
