import React from 'react';
import { Badge } from '@/components/ui/badge';

interface NodeHeaderProps {
    label: string;
}

export function NodeHeader({ label }: NodeHeaderProps) {
    return <Badge className="mb-2 text-xs">{label}</Badge>;
}

export default NodeHeader;
