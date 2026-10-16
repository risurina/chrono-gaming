import React from 'react';
import { Hourglass } from 'lucide-react';

interface ChronoSpinnerProps {
  size?: number; // Size in pixels
  className?: string;
}

export const ChronoSpinner: React.FC<ChronoSpinnerProps> = ({ size = 160, className = '' }) => {
  const innerInset = Math.round(size * 0.1); // 10% inset for inner ring
  const hourglassSize = Math.round(size * 0.2); // 20% of size
  
  return (
    <div 
      className={`relative flex items-center justify-center rounded-full bg-card/50 border border-border/20 backdrop-blur-sm ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer spinning ring */}
      <svg className="absolute inset-0 w-full h-full animate-spin [animation-duration:4s]" viewBox="0 0 100 100">
        <circle className="text-border/30" cx="50" cy="50" fill="none" r="48" stroke="currentColor" strokeWidth="0.5"></circle>
        {/* Gold accent arc */}
        <path className="text-primary" d="M 50 2 A 48 48 0 0 1 98 50" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"></path>
      </svg>

      {/* Inner counter-spinning ring */}
      <svg 
        className="absolute animate-spin [animation-duration:6s] [animation-direction:reverse]" 
        style={{ 
          top: innerInset, 
          left: innerInset, 
          width: size - (innerInset * 2), 
          height: size - (innerInset * 2) 
        }} 
        viewBox="0 0 100 100"
      >
        <circle className="text-primary/20" cx="50" cy="50" fill="none" r="48" stroke="currentColor" strokeDasharray="4 8" strokeWidth="0.5"></circle>
      </svg>

      {/* Center Logo Element */}
      <div className="flex flex-col items-center justify-center text-center px-2">
        <Hourglass 
          style={{ width: hourglassSize * 1.25, height: hourglassSize }} 
          className="text-primary" 
          strokeWidth={1.5} 
        />
        {size >= 120 && (
          <span 
            className="font-chrono font-bold text-primary tracking-[0.2em] opacity-90 uppercase mt-2 select-none"
            style={{ fontSize: Math.max(10, Math.round(size * 0.085)) }}
          >
            CHRONO
          </span>
        )}
      </div>
    </div>
  );
};
