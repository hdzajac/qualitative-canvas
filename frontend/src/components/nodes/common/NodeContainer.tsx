import React from 'react';

interface NodeContainerProps {
    selected?: boolean;
    className?: string;
    children: React.ReactNode;
}

export function NodeContainer({ selected, className = '', children }: NodeContainerProps) {
    return (
        <div className={`min-w-[200px] max-w-[250px] ${selected ? 'ring-4 ring-indigo-400' : ''} ${className}`}>
            {children}
        </div>
    );
}

export default NodeContainer;
