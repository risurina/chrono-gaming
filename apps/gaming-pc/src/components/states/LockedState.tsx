import React from 'react';
import { SessionViewModel } from '../../types/pc-client';
import { ScreenLayout } from '../ui/ScreenLayout';
import { StationStatus } from '../../types/pc-client';
import { Lock } from 'lucide-react';

interface LockedStateProps {
  session: SessionViewModel;
}

export const LockedState: React.FC<LockedStateProps> = ({ session }) => {
  return (
    <ScreenLayout stationId={session.stationId} status={session.status}>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full premium-card p-12 border-border/40 text-center grayscale opacity-80">
          <div className="w-16 h-16 rounded-xl bg-muted/50 flex items-center justify-center mb-8 mx-auto">
            <Lock className="h-8 w-8 text-danger" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-foreground/60 mb-4 uppercase">
            Station Locked
          </h2>
          <p className="text-muted-text text-lg leading-relaxed font-medium">
            {session.message || "This station is currently locked by the administrator."}
          </p>
          <div className="mt-8 pt-4 border-t border-border/20">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-text/40">
              Administratively Disabled
            </p>
          </div>
        </div></div>
    </ScreenLayout>
  );
};
