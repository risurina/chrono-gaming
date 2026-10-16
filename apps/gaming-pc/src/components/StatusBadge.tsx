import React from 'react';
import { StationStatus } from '../types/pc-client';
import { cn } from '../lib/utils';

interface StatusBadgeProps {
  status: StationStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const styles: Record<StationStatus, string> = {
    available: "bg-primary/10 text-primary border-primary/20",
    active: "bg-primary/10 text-primary border-primary/20",
    lowTime: "bg-destructive/10 text-destructive border-destructive/20",
    expired: "bg-destructive/10 text-destructive border-destructive/20",
    locked: "bg-muted text-muted-foreground border-border",
    maintenance: "bg-muted text-muted-foreground border-border",
    reserved: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    offline: "bg-muted text-muted-foreground border-border",
  };

  const labels: Record<StationStatus, string> = {
    available: "Available",
    active: "Active",
    lowTime: "Low Time",
    expired: "Expired",
    locked: "Locked",
    maintenance: "Maintenance",
    reserved: "Reserved",
    offline: "Offline",
  };

  return (
    <div className={cn(
      "inline-flex items-center rounded-sm border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest",
      styles[status],
      className
    )}>
      {labels[status]}
    </div>
  );
};
