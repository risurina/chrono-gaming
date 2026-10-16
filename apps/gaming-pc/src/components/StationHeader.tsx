import React from 'react';
import { BrandMark } from './BrandMark';
import { StatusBadge } from './StatusBadge';
import { StationStatus } from '../types/pc-client';

interface StationHeaderProps {
  stationId: string;
  status: StationStatus;
}

export const StationHeader: React.FC<StationHeaderProps> = ({ stationId, status }) => {
  return (
    <header className="flex items-center justify-between px-8 py-6 border-b border-border bg-card/50 backdrop-blur-md">
      <BrandMark />
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">STATION</span>
          <span className="text-xl font-black text-primary tracking-tight">{stationId}</span>
        </div>
        <StatusBadge status={status} className="h-fit" />
      </div>
    </header>
  );
};
