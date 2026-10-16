import React, { useState } from 'react';
import { runtime } from '../../features/runtime/pc-client-runtime';
import { ScreenLayout } from '../ui/ScreenLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Button, cn } from '@/ui-kit';

export const UnpairedState: React.FC = () => {
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await runtime.pair(pairingCode.trim());

      if (!result.success) {
        setError(result.error || 'Failed to pair device');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenLayout>
      <main className="flex flex-1 flex-col items-center justify-center space-y-6">
        <Card className={cn("max-w-md w-full p-8 md:p-12 flex flex-col items-center bg-transparent radius-xs border-0")}>
          <CardHeader className="p-0 mb-0 text-center flex flex-col items-center">
            <CardTitle className="text-3xl tracking-tight mb-1 uppercase text-gold border-none font-black uppercase ">
              Pair Device
            </CardTitle>
            <CardDescription className="text-muted-foreground text-md leading-relaxed font-medium">
              Enter the client pairing code from your admin dashboard.
            </CardDescription>
          </CardHeader>

          <CardContent className="w-full p-0 flex flex-col gap-4">
            <form onSubmit={handlePair} className="w-full flex flex-col gap-4">
              {error && <p className="text-destructive text-sm font-semibold text-center">{error}</p>}

              <Input
                type="text"
                placeholder="Enter Pairing Code"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                className="w-full border-gold/20 h-12 text-center text-md tracking-wider text-foreground focus:outline-none focus:border-gold font-mono"
                radius="sm"
              />

              <Button
                variant="secondary"
                type="submit"
                disabled={loading}
                className="w-full h-10 text-xs text-gray-900 font-black uppercase bg-gold "
                radius="sm"
              >
                {loading ? 'Pairing...' : 'Pair Device'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </ScreenLayout>
  );
};
