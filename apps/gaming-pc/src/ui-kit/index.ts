/**
 * UI barrel for the PC client — the single import source that replaced
 * `@risurina/oikos/ui`.
 *
 * The real components come from the `agora` foundation's `agora/ui` (shadcn
 * set); the oikos-style layout/typography primitives agora doesn't ship
 * (`Box`/`Flex`/`Text`/`Heading`/`ThemeProvider`/`ui`) are provided locally in
 * `./primitives`. Only the specific agora leaves the client uses are re-exported
 * (never `export *`), so Next.js-coupled agora components — `SiteHeader`,
 * `BrandHeader`, etc. — never enter this non-Next Tauri/Vite bundle.
 */
export {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Label,
} from 'agora/ui';
export { cn } from 'agora/ui/cn';

// Button + Input are the agora components wrapped to accept the oikos-era
// `radius` prop (and Button's `variant="icon"`) — see ./primitives.
export { Box, Flex, Text, Heading, ThemeProvider, ui, Button, Input } from './primitives';
