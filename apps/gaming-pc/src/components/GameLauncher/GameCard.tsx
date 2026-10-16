import React from 'react';
import { Gamepad2, Loader2 } from 'lucide-react';
import { Box, Flex, Text, Button, cn } from '@risurina/oikos/ui';
import type { Game } from '../../types/native';

const CATEGORY_STYLES: Record<string, string> = {
  FPS: 'bg-red-500/15 text-red-400 border-red-500/25',
  MOBA: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  RPG: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  'Battle Royale': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  Casual: 'bg-green-500/15 text-green-400 border-green-500/25',
};

interface GameCardProps {
  game: Game;
  onLaunch: (id: string) => void;
  launching: boolean;
  compact?: boolean;
}

export function GameCard({ game, onLaunch, launching, compact = false }: GameCardProps) {
  const categoryStyle = CATEGORY_STYLES[game.category] ?? 'bg-primary/15 text-primary border-primary/25';

  if (compact) {
    return (
      <Flex
        align="center"
        justify="between"
        className="group rounded-md border border-border/20 bg-background/30 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5"
      >
        <Flex align="center" gap="2" className="min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/20 bg-background/60">
            {game.iconUrl ? (
              <img src={game.iconUrl} alt={game.name} className="h-5 w-5 object-contain" />
            ) : (
              <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
          </div>
          <Box className="min-w-0">
            <Text className="truncate text-[11px] font-bold text-foreground">{game.name}</Text>
            <span className={cn('inline-block rounded border px-1 py-px text-[7px] font-black uppercase tracking-wider', categoryStyle)}>
              {game.category}
            </span>
          </Box>
        </Flex>
        <Button
          size="sm"
          onClick={() => onLaunch(game.id)}
          disabled={launching}
          className="h-6 shrink-0 px-2 text-[9px] font-black uppercase tracking-wider"
        >
          {launching ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Play'}
        </Button>
      </Flex>
    );
  }

  return (
    <Box className="group flex flex-col rounded-lg border border-border/20 bg-background/30 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
      <Flex align="center" gap="3" className="mb-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/20 bg-background/60">
          {game.iconUrl ? (
            <img src={game.iconUrl} alt={game.name} className="h-9 w-9 object-contain" />
          ) : (
            <Gamepad2 className="h-6 w-6 text-muted-foreground/50" />
          )}
        </div>
        <Box className="min-w-0 flex-1">
          <Text className="truncate text-sm font-black text-foreground">{game.name}</Text>
          <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider', categoryStyle)}>
            {game.category}
          </span>
        </Box>
      </Flex>
      <Button
        size="sm"
        onClick={() => onLaunch(game.id)}
        disabled={launching}
        className="mt-auto h-8 w-full gap-1.5 text-[10px] font-black uppercase tracking-wider"
      >
        {launching ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Launching...
          </>
        ) : (
          <>
            <Gamepad2 className="h-3.5 w-3.5" /> Play
          </>
        )}
      </Button>
    </Box>
  );
}
