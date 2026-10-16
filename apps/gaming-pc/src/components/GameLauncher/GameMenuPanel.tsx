import React, { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Search } from 'lucide-react';
import { Box, Flex, Text, Input, cn } from '@risurina/oikos/ui';
import { PcClientApi } from '../../features/api/pc-client-api';
import { GameCard } from './GameCard';
import type { Game } from '../../types/native';

/**
 * Full game library for the active-session shell's left region. Reuses the
 * launch flow (`PcClientApi.getGames` / `launchGame`) that previously lived in
 * the rail-embedded `GameLauncherWidget`, but sized to fill the region.
 */
export function GameMenuPanel() {
  const [games, setGames] = useState<Game[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    PcClientApi.getGames()
      .then((list) => setGames(list ?? []))
      .catch(() => setGames([]));
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(games.map((g) => g.category)));
    return ['All', ...cats];
  }, [games]);

  const filtered = useMemo(() => {
    return games.filter((g) => {
      const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'All' || g.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [games, search, activeCategory]);

  const handleLaunch = async (id: string) => {
    setLaunching(id);
    setError(null);
    try {
      const result = await PcClientApi.launchGame(id);
      if (!result?.success) {
        setError(result?.error ?? 'Failed to launch game');
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to launch game');
    } finally {
      setLaunching(null);
    }
  };

  return (
    <Flex direction="col" className="h-full min-h-0 w-full">
      {/* Header */}
      <Flex
        justify="between"
        align="center"
        className="shrink-0 border-b border-border/20 bg-background/60 px-6 py-4 backdrop-blur-md"
      >
        <Flex align="center" gap="3">
          <Gamepad2 className="h-5 w-5 text-primary" />
          <Text className="text-base font-black uppercase tracking-widest text-foreground">
            Game Library
          </Text>
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
            {filtered.length} available
          </span>
        </Flex>
      </Flex>

      {/* Search + Categories */}
      <Box className="shrink-0 border-b border-border/10 px-6 py-3">
        <Flex align="center" gap="3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              placeholder="Search games..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-border/20 bg-background/40 pl-8 text-xs"
            />
          </div>
          <Flex align="center" gap="1.5" className="flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={cn(
                  'rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider transition-colors',
                  activeCategory === cat
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-border/20 bg-background/30 text-muted-foreground hover:border-border/40 hover:text-foreground',
                )}
              >
                {cat}
              </button>
            ))}
          </Flex>
        </Flex>
      </Box>

      {/* Error */}
      {error && (
        <Box className="mx-6 mt-3 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-[11px] font-bold text-destructive">{error}</Text>
        </Box>
      )}

      {/* Game Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <Flex direction="col" align="center" justify="center" className="h-48 gap-3 opacity-40">
            <Gamepad2 className="h-10 w-10 text-muted-foreground" />
            <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {games.length === 0 ? 'No games configured' : 'No games match your search'}
            </Text>
          </Flex>
        ) : (
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onLaunch={handleLaunch}
                launching={launching === game.id}
                compact={false}
              />
            ))}
          </div>
        )}
      </div>
    </Flex>
  );
}
