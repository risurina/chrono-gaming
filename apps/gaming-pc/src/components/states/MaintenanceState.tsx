import React from 'react';
import { SessionViewModel } from '../../types/pc-client';
import { ScreenLayout } from '../ui/ScreenLayout';
import { Wrench } from 'lucide-react';

interface MaintenanceStateProps {
  session: SessionViewModel;
}

export const MaintenanceState: React.FC<MaintenanceStateProps> = ({ session }) => {
  return (
    <ScreenLayout stationId={session.stationId} status={session.status}>
      <div className="flex-1 flex items-center justify-center p-8 bg-waning/1 ">
      <div className="max-w-md w-full premium-card p-12 border-gold/10 text-center">
        <div className="w-16 h-16 rounded-xl bg-gold/5 flex items-center justify-center mb-8 mx-auto">
          <Wrench className="h-8 w-8 text-gold animate-pulse" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-foreground mb-4 uppercase">
          Maintenance
        </h2>
        <p className="text-muted-text text-lg leading-relaxed font-medium">
          {session.message || "This station is currently undergoing scheduled maintenance. Please use another PC or contact staff."}
        </p>
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gold/40">
          System Updates in Progress
        </p>
      </div>
      </div>
    </ScreenLayout>
  );
};
