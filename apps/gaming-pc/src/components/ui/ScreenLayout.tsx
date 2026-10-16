import React from 'react';
import { cn, ui } from '@/ui-kit';
import { StationHeader } from '../StationHeader';
import { FooterStatusBar } from '../FooterStatusBar';
import { StationStatus } from '../../types/pc-client';

interface ScreenLayoutProps {
  children: React.ReactNode;
  className?: string;
  stationId?: string;
  status?: StationStatus;
}

export const ScreenLayout: React.FC<ScreenLayoutProps> = ({ children, className, stationId, status }) => {
  return (
    <div className={cn("dark bg-background text-foreground relative flex min-h-[calc(100svh)] w-full flex-col overflow-hidden antialiased", ui.premiumDots, className)}>
      {/* Visual Accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gold/5 blur-[120px] rounded-full -z-10" />
      <div className="absolute top-[10%] right-[10%] w-[400px] h-[400px] bg-gold/5 blur-[100px] rounded-full -z-10 animate-pulse" />

      {/* Decorative background effects */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(var(--background),0.8)_100%)] z-0" />

      <div className="w-full h-full flex flex-1">
        {children}
      </div>

      <FooterStatusBar />
    </div>
  );
};
