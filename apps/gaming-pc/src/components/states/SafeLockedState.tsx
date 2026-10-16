import React from 'react';
import { SessionViewModel } from '../../types/pc-client';
import { ScreenLayout } from '../ui/ScreenLayout';
import { Lock } from 'lucide-react';

export const SafeLockedState: React.FC<{ session: SessionViewModel }> = ({ session }) => {
  return (
    <ScreenLayout>
      <div className="flex-1 flex items-center justify-center p-8 bg-danger/1 ">
        <div className="max-w-md w-full premium-card p-12 border-danger/30 text-center">
          <div className="w-16 h-16 rounded-xl bg-danger/2 flex items-center justify-center mb-8 mx-auto">
            <Lock className="h-8 w-8 text-danger" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-foreground mb-4 uppercase">
            Security Lock
          </h2>
          <p className="text-muted-text text-lg leading-relaxed font-medium">
            This station is locked for protection. Please call staff before using this PC.
          </p>
          <div className="mt-12 pt-8 border-t border-danger/20">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-danger/70">
              Staff verification required
            </p>
            <p className="mt-3 text-md uppercase text-muted-text/60">
              {session.stationId}
            </p>
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
};
