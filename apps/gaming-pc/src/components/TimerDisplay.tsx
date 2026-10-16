import React from 'react';
import { cn } from '../lib/utils';
import { formatTimer, shouldShowSeconds } from '../lib/session-utils';

interface TimerDisplayProps {
  seconds: number;
  className?: string;
  isExpired?: boolean;
  forceShowSeconds?: boolean;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  seconds,
  className,
  isExpired,
  forceShowSeconds = false
}) => {
  const showSeconds = forceShowSeconds || shouldShowSeconds(seconds);
  const formatted = formatTimer(seconds, showSeconds);

  return (
    <div className={cn(
      "font-mono font-black tracking-tighter transition-colors duration-1000",
      isExpired ? "text-danger" : "text-primary drop-shadow-[0_0_12px_rgba(var(--primary-rgb),0.4)] flex space-x-3",
      className
    )}>
      <div>{formatted.hours}:{formatted.mins}</div>
      <div className="flex flex-col pt-1">
        <span className="text-[0.4em] opacity-50">{formatted.secs}</span>
        <span className="text-[0.16em] opacity-50 tracking-tighter">SECS</span>
      </div>
    </div>
  );
};
