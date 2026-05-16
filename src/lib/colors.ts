import type { ViewMode } from "./ontology";

const AMBER_PALETTE = [
  "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24",
  "#f59e0b", "#d97706", "#b45309",
] as const;

const EMERALD_PALETTE = [
  "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399",
  "#10b981", "#059669", "#047857",
] as const;

const GRAY_PALETTE = [
  "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3",
  "#888888", "#737373", "#525252",
] as const;

export function depthColor(depth: number): string {
  return AMBER_PALETTE[Math.min(depth, AMBER_PALETTE.length - 1)];
}

export function grayDepthColor(depth: number): string {
  return GRAY_PALETTE[Math.min(depth, GRAY_PALETTE.length - 1)];
}

export function depthColorForMode(depth: number, mode: ViewMode): string {
  const palette = mode === "exploration" ? EMERALD_PALETTE : AMBER_PALETTE;
  return palette[Math.min(depth, palette.length - 1)];
}
