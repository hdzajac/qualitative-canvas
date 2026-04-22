import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Insight } from '@/types';

export interface InsightCardData {
  insight: Insight;
  onOpen: (id: string) => void;
}

function InsightCard({ data, selected }: NodeProps) {
  const { insight, onOpen } = data as unknown as InsightCardData;

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpen(insight.id);
    },
    [insight.id, onOpen]
  );

  return (
    <div
      className="relative bg-white flex overflow-hidden"
      style={{
        width: '100%',
        height: '100%',
        border: selected ? '3px solid #f59e0b' : '1.5px solid #111827',
        boxShadow: selected
          ? '0 6px 14px rgba(0,0,0,0.25)'
          : '0 3px 6px rgba(0,0,0,0.06)',
      }}
    >
      {/* Left accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400" />

      {/* Open icon */}
      <button
        className="absolute top-1.5 right-1 text-gray-700 text-xs leading-none hover:text-amber-400 focus:outline-none"
        onClick={handleOpen}
        aria-label="Open insight"
      >
        ↗
      </button>

      {/* Title */}
      <div
        className="pl-4 pr-6 pt-2 pb-2 text-gray-900 text-sm leading-snug w-full overflow-hidden"
        style={{ wordBreak: 'break-word' }}
      >
        {insight.name || 'Untitled'}
      </div>

      {/* React Flow handles — insight is a target only */}
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
    </div>
  );
}

export default memo(InsightCard);
