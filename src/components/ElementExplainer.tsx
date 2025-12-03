import { X, Volume2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface ElementExplainerProps {
  elementText: string;
  explanation: string;
  isLoading?: boolean;
  isSpeaking?: boolean;
  onClose: () => void;
  onSpeak: () => void;
  onQuick?: () => void;
  onDeepDive?: () => void;
  position?: { x: number; y: number };
}

export default function ElementExplainer({
  elementText,
  explanation,
  isLoading = false,
  isSpeaking = false,
  onClose,
  onSpeak,
  onQuick,
  onDeepDive,
  position,
}: ElementExplainerProps) {
  const [adjustedPosition, setAdjustedPosition] = useState<{ top: string; left: string } | null>(null);

  useEffect(() => {
    if (!position) {
      setAdjustedPosition({ top: '50%', left: '50%' });
      return;
    }

    let top = position.y - 150;
    let left = position.x + 20;

    // Keep within viewport
    if (top < 20) top = 20;
    if (left + 320 > window.innerWidth) left = position.x - 340;

    setAdjustedPosition({
      top: `${top}px`,
      left: `${left}px`,
    });
  }, [position]);

  if (!adjustedPosition) return null;

  return (
    <div
      className="fixed z-50 w-80 bg-white border border-border rounded-lg shadow-xl animate-fade-in"
      style={adjustedPosition}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border">
        <div className="flex-1 pr-2">
          <div className="text-sm font-semibold text-foreground truncate">{elementText}</div>
          <div className="text-xs text-muted-foreground mt-1">Diagram Element</div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-accent rounded-md transition-colors flex-shrink-0"
          title="Close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading explanation...</span>
          </div>
        ) : explanation ? (
          <div className="text-sm text-foreground leading-relaxed max-h-48 overflow-y-auto scrollbar-thin">
            {explanation}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">No explanation available</div>
        )}
      </div>

      {/* Footer: Quick / Deep Dive or audio button */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        {isLoading ? (
          <div className="flex-1 text-sm text-muted-foreground">Loading...</div>
        ) : !explanation ? (
          <>
            <button
              onClick={onQuick}
              className="flex-1 bg-secondary text-secondary-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-secondary/80"
            >
              Quick Explain
            </button>
            <button
              onClick={onDeepDive}
              className="flex-1 bg-primary text-primary-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-primary/90"
            >
              Deep Dive
            </button>
          </>
        ) : (
          <button
            onClick={onSpeak}
            disabled={isSpeaking}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isSpeaking
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            <Volume2 className={cn('w-4 h-4', isSpeaking && 'animate-pulse')} />
            <span>{isSpeaking ? 'Playing...' : 'Listen'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
