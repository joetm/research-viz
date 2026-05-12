const PALETTE = [
  "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24",
  "#f59e0b", "#d97706", "#b45309",
] as const;

export function depthColor(depth: number): string {
  return PALETTE[Math.min(depth, PALETTE.length - 1)];
}
