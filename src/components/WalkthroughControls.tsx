import { Play, Pause, SkipForward, SkipBack, Stop } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WalkthroughControlsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onStop: () => void;
  className?: string;
}

export default function WalkthroughControls({
  isPlaying,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onStop,
  className,
}: WalkthroughControlsProps) {
  return (
    <div className={cn('fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-card/90 border border-border rounded-full px-3 py-2 shadow-lg', className)}>
      <button onClick={onPrev} title="Previous" className="p-2 hover:bg-accent rounded-md">
        <SkipBack className="w-4 h-4" />
      </button>

      {isPlaying ? (
        <button onClick={onPause} title="Pause" className="p-2 bg-primary text-primary-foreground rounded-full">
          <Pause className="w-4 h-4" />
        </button>
      ) : (
        <button onClick={onPlay} title="Play" className="p-2 bg-primary text-primary-foreground rounded-full">
          <Play className="w-4 h-4" />
        </button>
      )}

      <button onClick={onNext} title="Next" className="p-2 hover:bg-accent rounded-md">
        <SkipForward className="w-4 h-4" />
      </button>

      <button onClick={onStop} title="Stop" className="p-2 hover:bg-accent rounded-md">
        <Stop className="w-4 h-4" />
      </button>
    </div>
  );
}
