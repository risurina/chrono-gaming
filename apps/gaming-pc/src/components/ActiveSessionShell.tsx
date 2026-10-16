import React from 'react';
import { Gamepad2 } from 'lucide-react';
import { Box, Flex, Text, cn, ui } from '@/ui-kit';

interface ActiveSessionShellProps {
  /** Right-hand timer rail (SessionDashboard content). */
  rail: React.ReactNode;
  /** Optional left-region content; defaults to the coming-soon placeholder. */
  menu?: React.ReactNode;
}

/**
 * Full-screen active-session shell. Rendered inside the maximized `widget`
 * window (see `src-tauri/src/kiosk.rs`). Splits the screen into a `flex-1`
 * left region reserved for the game menu and a fixed-width right timer rail.
 */
export const ActiveSessionShell: React.FC<ActiveSessionShellProps> = ({ rail, menu }) => (
  <Flex
    className={cn(
      'dark h-screen w-screen overflow-hidden bg-background text-foreground',
      ui.premiumDots,
    )}
  >
    {/* Left region — reserved for the game menu (Phase 3) */}
    <Box className="relative flex min-w-0 flex-1 flex-col">
      {menu ?? (
        <Flex
          direction="col"
          align="center"
          justify="center"
          className="h-full gap-3 opacity-40"
        >
          <Gamepad2 className="h-12 w-12 text-muted-foreground" />
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Game menu coming soon
          </Text>
        </Flex>
      )}
    </Box>

    {/* Right timer rail — fixed width */}
    <Box className="w-[360px] shrink-0 border-l border-border/30">{rail}</Box>
  </Flex>
);
