import React from 'react';
import { ScreenLayout } from '../ui/ScreenLayout';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@risurina/oikos/ui';
import { Hourglass } from 'lucide-react';
import { ChronoSpinner } from '../ui/ChronoSpinner';

export const PendingApprovalState: React.FC = () => {
  return (
    <ScreenLayout>
      <main className="flex flex-1 flex-col items-center justify-center space-y-6">
        <Card className={cn("max-w-md w-full p-8 md:p-12 flex flex-col items-center bg-transparent radius-xs border-0")}>
          <CardHeader className="p-0 mb-0 text-center flex flex-col items-center">
            <ChronoSpinner size={80} />

            <CardTitle className="text-3xl tracking-tight mb-1 uppercase text-gold border-none font-black uppercase ">
              Pending Approval
            </CardTitle>
            <CardDescription className="text-muted-foreground text-lg leading-relaxed font-medium">
              This PC is registered but needs admin approval to join the branch.
            </CardDescription>
          </CardHeader>

          <CardContent className="w-full p-0 flex item-center justify-center">
             <Button
              variant="outline"
              type="submit"
              className="w-1/2 h-10 text-xs font-black uppercase"
              radius="sm"
            >
              Contact Staff
            </Button>
          </CardContent>
        </Card>
      </main>
    </ScreenLayout>
  );
};
