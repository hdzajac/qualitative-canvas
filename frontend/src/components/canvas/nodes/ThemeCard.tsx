import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Theme } from '@/types';

export interface ThemeCardData {
  theme: Theme;
  label?: string;
  onOpen: (id: string) => void;
}

function ThemeCard({ data, selected }: NodeProps) {
  const { theme, label, onOpen } = data as unknown as ThemeCardData;

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpen(theme.id);
    },
    [theme.id, onOpen]
  );

  return (
    <div
      className="relative bg-white flex overflow-hidden"
      style={{
        width: '100%',
        height: '100%',
        border: selected ? '3px solid #10b981' : '1.5px solid #111827',
        boxShadow: selected
          ? '0 6px 14px rgba(0,0,0,0.25)'
          : '0 3px 6px rgba(0,0,0,0.06)',
      }}
    >
      {/* Left accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />

      {/* Open icon */}
      <button
        className="absolute top-1.5 right-1 text-gray-700 text-xs leading-none hover:text-emerald-500 focus:outline-none"
        onClick={handleOpen}
        aria-label="Open theme"
      >
        ↗
      </button>

      {/* Title */}
      <div
        className="pl-4 pr-6 pt-2 pb-5 text-gray-900 text-sm leading-snug w-full overflow-hidden"
        style={{ wordBreak: 'break-word' }}
      >
        {theme.name || 'Untitled'}
      </div>

      {/* Bottom-right label */}
      {label && (
        <div
          className="absolute bottom-1 left-4 right-2 text-gray-400 overflow-hidden whitespace-nowrap text-ellipsis"
          style={{ fontSize: 11 }}
        >
          {label}
        </div>
      )}

      {/* React Flow handles */}
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !rounded-full !bg-white !border !border-emerald-500 !opacity-0 hover:!opacity-100 transition-opacity"
        style={{ right: -5 }}
      />
    </div>
  );
}

export default memo(ThemeCard);
