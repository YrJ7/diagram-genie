import { Volume2, VolumeX, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpeechControlsProps {
  isSpeaking: boolean;
  onStop: () => void;
  onPause: () => void;
  className?: string;
}

export default function SpeechControls({
  isSpeaking,
  onStop,
  onPause,
  className,
}: SpeechControlsProps) {
  if (!isSpeaking) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-full bg-primary text-primary-foreground shadow-lg animate-fade-in',
        className
      )}
    >
      <Volume2 className="w-4 h-4 animate-pulse" />
      <span className="text-sm font-medium">Listening...</span>
      <button
        onClick={onPause}
        className="p-1 hover:bg-white/20 rounded-full transition-colors"
        title="Pause/Resume"
      >
        <Pause className="w-4 h-4" />
      </button>
      <button
        onClick={onStop}
        className="p-1 hover:bg-white/20 rounded-full transition-colors"
        title="Stop"
      >
        <VolumeX className="w-4 h-4" />
      </button>
    </div>
  );
}
