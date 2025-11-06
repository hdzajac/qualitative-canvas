import React from 'react';
import { Button } from '@/components/ui/button';

export type CanvasContextPopupProps = {
    selectedCodeCount: number;
    selectedThemeCount: number;
    onCreateTheme: () => Promise<void> | void;
    onCreateInsight: () => Promise<void> | void;
};

export const CanvasContextPopup: React.FC<CanvasContextPopupProps> = ({ selectedCodeCount, selectedThemeCount, onCreateTheme, onCreateInsight }) => {
    const show = selectedCodeCount >= 2 || selectedThemeCount >= 1;
    if (!show) return null;
    return (
        <div className="absolute z-20 bg-white border-2 border-black p-2 left-3 top-3 space-y-2">
            {selectedCodeCount >= 2 && (
                <div>
                    <div className="text-xs mb-2">{selectedCodeCount} codes selected</div>
                    <Button size="sm" className="brutal-button" onClick={() => void onCreateTheme()}>
                        Create Theme
                    </Button>
                </div>
            )}
            {selectedThemeCount >= 1 && (
                <div>
                    <div className="text-xs mb-2">{selectedThemeCount} themes selected</div>
                    <Button size="sm" className="brutal-button" onClick={() => void onCreateInsight()}>
                        Create Insight
                    </Button>
                </div>
            )}
        </div>
    );
};

export default CanvasContextPopup;
