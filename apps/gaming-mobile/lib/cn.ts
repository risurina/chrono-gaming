/**
 * Utility for merging styles and class names (inspired by shadcn/ui)
 */

export function cn(...args: any[]) {
  return args.filter(Boolean).flat();
}
