import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Label, Input, Button } from '@/ui-kit';

/**
 * Operator recovery PIN entry (window mode `recovery`). Submits the PIN to the
 * Rust core, which verifies it against CHRONO_RECOVERY_PIN_HASH and, on success,
 * reverts kiosk policies and enters maintenance.
 */
export function RecoveryScreen() {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    try {
      const ok = await invoke<boolean>('submit_recovery_pin', { pin });
      if (!ok) {
        setStatus('error');
        setPin('');
      }
      // On success the Rust side closes this window.
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Operator Recovery</CardTitle>
          <CardDescription>Enter the operator PIN to unlock this station for maintenance.</CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="space-y-2">
            <Label htmlFor="recovery-pin">PIN</Label>
            <Input
              id="recovery-pin"
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
            />
            {status === 'error' && (
              <p className="text-sm text-destructive">Invalid PIN. Try again.</p>
            )}
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={status === 'submitting' || pin.length === 0}>
              {status === 'submitting' ? 'Verifying…' : 'Unlock'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
