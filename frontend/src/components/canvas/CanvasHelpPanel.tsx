import { Button } from '../ui/button';
import { HelpCircle } from 'lucide-react';

interface CanvasHelpPanelProps {
    visible: boolean;
    onToggle: () => void;
}

/**
 * Help panel overlay for Canvas keyboard shortcuts and tips
 */
export const CanvasHelpPanel: React.FC<CanvasHelpPanelProps> = ({ visible, onToggle }) => {
    return (
        <>
            {/* Help button */}
            <div className="absolute left-2 bottom-2 z-40" onClick={(e) => e.stopPropagation()}>
                <Button
                    size="icon"
                    variant="outline"
                    className="rounded-full shadow"
                    onClick={onToggle}
                    aria-label="Canvas help"
                >
                    <HelpCircle className="w-5 h-5" />
                </Button>
            </div>

            {/* Help panel */}
            {visible && (
                <div
                    className="absolute left-2 bottom-14 z-40 w-80 bg-white border-2 border-black p-3 text-sm shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-2">
                        <div className="font-semibold">Canvas Shortcuts & Tips</div>
                        <button className="text-xs underline" onClick={onToggle}>close</button>
                    </div>
                    <ul className="space-y-1 list-disc list-inside">
                        <li><span className="font-mono">Space</span> hold: pan view</li>
                        <li><span className="font-mono">Wheel</span>: zoom at cursor</li>
                        <li><span className="font-mono">V</span>: select tool</li>
                        <li><span className="font-mono">H</span>: hand (pan) tool</li>
                        <li><span className="font-mono">T</span>: create Theme (if codes selected) else Text tool</li>
                        <li><span className="font-mono">I</span>: create Insight (if themes selected)</li>
                        <li><span className="font-mono">Shift+Click</span>: multi-select</li>
                        <li><span className="font-mono">Delete</span>: delete selected codes/themes</li>
                        <li>Drag small right-side dot to connect (Code→Theme, Theme→Insight)</li>
                        <li>Hover connection: red highlight + X cursor, click removes link</li>
                        <li>Text tool: click canvas to add annotation</li>
                    </ul>
                </div>
            )}
        </>
    );
};
