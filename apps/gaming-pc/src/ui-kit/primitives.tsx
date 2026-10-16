import * as React from 'react';
import { cn } from 'agora/ui/cn';
import { Button as AgoraButton, Input as AgoraInput, type ButtonProps as AgoraButtonProps } from 'agora/ui';

/**
 * Layout/typography primitives the client previously pulled from
 * `@risurina/oikos/ui`. The repo is built on the `agora` foundation, whose
 * `agora/ui` provides the shadcn component set (Button, Card, Input, …) but not
 * these oikos-style primitives — and `packages/agora` is a read-only submodule,
 * so they live here instead. Kept API-compatible with the oikos usage
 * (`direction`/`align`/`justify`/`gap` on Flex, `level` on Heading) so the
 * ported components need no prop changes — only their import specifier moved to
 * the `@/ui-kit` barrel.
 */

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const Box = React.forwardRef<HTMLDivElement, DivProps>(function Box(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={className} {...rest} />;
});

type FlexAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
type FlexJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

export interface FlexProps extends DivProps {
  direction?: 'row' | 'col';
  align?: FlexAlign;
  justify?: FlexJustify;
  /** Tailwind spacing scale value, e.g. "2", "1.5", "3". */
  gap?: string | number;
}

// Literal class maps so Tailwind's scanner sees every generated utility
// (dynamic `gap-${x}` template strings are NOT detected by the scanner).
const ALIGN: Record<FlexAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};
const JUSTIFY: Record<FlexJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};
const GAP: Record<string, string> = {
  '0': 'gap-0',
  '0.5': 'gap-0.5',
  '1': 'gap-1',
  '1.5': 'gap-1.5',
  '2': 'gap-2',
  '2.5': 'gap-2.5',
  '3': 'gap-3',
  '4': 'gap-4',
  '5': 'gap-5',
  '6': 'gap-6',
  '8': 'gap-8',
  '10': 'gap-10',
  '12': 'gap-12',
};

export const Flex = React.forwardRef<HTMLDivElement, FlexProps>(function Flex(
  { className, direction = 'row', align, justify, gap, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex',
        direction === 'col' ? 'flex-col' : 'flex-row',
        align ? ALIGN[align] : undefined,
        justify ? JUSTIFY[justify] : undefined,
        gap != null ? GAP[String(gap)] : undefined,
        className,
      )}
      {...rest}
    />
  );
});

export const Text = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  function Text({ className, ...rest }, ref) {
    return <span ref={ref} className={className} {...rest} />;
  },
);

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { level = 2, className, ...rest },
  ref,
) {
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
  return React.createElement(Tag, { ref, className, ...rest });
});

/**
 * Minimal `next-themes`-style provider. The client only ever uses
 * `defaultTheme="dark" enableSystem={false}`, so this just applies the theme
 * class to the document root — no system-preference tracking, no persistence.
 */
export interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  React.useEffect(() => {
    const root = document.documentElement;
    if (defaultTheme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [defaultTheme]);
  return <>{children}</>;
}

/**
 * The oikos `ui` helper object. Only `ui.premiumDots` (a decorative dotted
 * background utility class) is used by the client; `.premium-dots` is defined
 * in `index.css`.
 */
export const ui = {
  premiumDots: 'premium-dots',
} as const;

/*
 * Button / Input wrappers that absorb the two oikos-era props agora's shadcn
 * components don't have, so the ported client files need no edits:
 *   - `radius` (e.g. "sm"/"md") → a `rounded-*` class
 *   - Button `variant="icon"`   → agora's `variant="ghost"` (paired with the
 *     `size="icon"` the call sites already pass)
 */
const RADIUS: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

export type ButtonProps = Omit<AgoraButtonProps, 'variant'> & {
  variant?: AgoraButtonProps['variant'] | 'icon';
  radius?: string;
};

export function Button({ variant, radius, className, ...rest }: ButtonProps) {
  const mappedVariant = variant === 'icon' ? 'ghost' : variant;
  return (
    <AgoraButton
      variant={mappedVariant}
      className={cn(radius ? RADIUS[radius] : undefined, className)}
      {...rest}
    />
  );
}

export type InputProps = React.ComponentProps<typeof AgoraInput> & { radius?: string };

export function Input({ radius, className, ...rest }: InputProps) {
  return <AgoraInput className={cn(radius ? RADIUS[radius] : undefined, className)} {...rest} />;
}
