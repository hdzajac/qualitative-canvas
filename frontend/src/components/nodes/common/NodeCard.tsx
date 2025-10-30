import React from 'react';
import { Card } from '@/components/ui/card';

interface NodeCardProps {
    children: React.ReactNode;
    className?: string;
}

export function NodeCard({ children, className = '' }: NodeCardProps) {
    return (
        <Card className={`p-3 bg-card shadow-md border-l-4 ${className}`}>
            {children}
        </Card>
    );
}

export default NodeCard;
