import React from 'react';
import { cn } from '@risurina/oikos/ui';
import { CLIENT_CONFIG } from '../config/client-config';

export const FooterStatusBar: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <footer className={cn("fixed bottom-0 left-0 right-0 px-8 pt-3 pb-5 border-t border-border bg-background flex justify-between items-center", className)}>
      <div className="flex flex-col text-left">
        <span className="text-[10px] font-chrono font-bold uppercase tracking-widest text-muted-foreground h-[12px]">
          <span className="">CHRONO</span> Platform
        </span>
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground h-[12px]">
          VERSION {CLIENT_CONFIG.VERSION}
        </span>
      </div>
      <div className="flex flex-col space-y-0">
        <span className="text-[10px] font-bold tracking-widest text-right h-[12px] font-chrono">
          POWERED BY CHRONO
        </span>
        <span className="text-[10px] font-bold tracking-widest text-right h-[12px] text-muted-foreground">
          www.izur.com.ph
        </span>
      </div>
    </footer>
  );
};
