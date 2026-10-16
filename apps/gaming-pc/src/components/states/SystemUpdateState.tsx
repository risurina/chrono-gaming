import React from 'react';
import { ScreenLayout } from '../ui/ScreenLayout';
import { Loader2 } from 'lucide-react';

export const SystemUpdateState: React.FC = () => {
  return (
    <ScreenLayout>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full premium-card p-12 text-center relative overflow-hidden group">
          <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mb-8 mx-auto">
            <Loader2 className="h-8 w-8 text-gold animate-spin" />
          </div>

          <h2 className="text-3xl font-black tracking-tight text-gold mb-4 uppercase">
            System Update
          </h2>

          <p className="text-muted-text text-lg leading-relaxed mb-10 font-medium">
            A software update is currently in progress. Please do not turn off or restart the computer.
          </p>

          <div className="w-full py-4 px-6 bg-gold/5 border border-gold/20 rounded-sm">
            <p className="text-sm font-bold text-foreground">
              This station will become available shortly.
            </p>
          </div>

          <p className="mt-8 text-[10px] font-black uppercase tracking-widest text-muted-text/40">
            Updating Client Runtime...
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
};
