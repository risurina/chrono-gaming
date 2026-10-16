import React from 'react';
import { SessionViewModel } from '../../types/pc-client';
import { ScreenLayout } from '../ui/ScreenLayout';
import { WifiOff } from 'lucide-react';

interface OfflineStateProps {
  session: SessionViewModel;
}

export const OfflineState: React.FC<OfflineStateProps> = ({ session }) => {
  return (
    <ScreenLayout stationId={session.stationId} status={session.status}>
      <div className="flex-1 flex items-center justify-center p-8 bg-waning/1 ">
        <div className="max-w-md w-full premium-card p-12 border-gold/10 text-center">
          <div className="w-16 h-16 rounded-xl bg-gold/5 flex items-center justify-center mb-8 mx-auto">
            <WifiOff className="h-8 w-8 text-gold animate-pulse" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-foreground mb-4 uppercase">
            Connection Lost
          </h2>
          <p className="text-muted-text text-lg leading-relaxed font-medium">
            {session.message || "This station cannot reach the server. Any active session keeps running and will reconcile automatically once the connection is restored. Please contact staff if this persists."}
          </p>
          <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gold/40">
            Reconnecting…
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
};
