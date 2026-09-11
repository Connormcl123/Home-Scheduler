import { useMemo, type CSSProperties } from "react";

/**
 * The Ambient look: the whole dashboard is tinted like the sky outside. Each
 * palette is exposed as CSS variables on <main>, so Tailwind's amb-* colours
 * and every screen pick it up without knowing which part of the day it is.
 */
export type AmbientKey = "dawn" | "morning" | "dusk" | "night";

export interface AmbientPalette {
  bg: string;
  sun: string;
  ink: string;
  muted: string;
  card: string;
  rail: string;
  /** Nested rows inside a card. */
  well: string;
  /** Dialogs and popovers: opaque, so they read over a dimmed backdrop. */
  sheet: string;
  border: string;
  shadow: string;
  accent: string;
  accentInk: string;
  /** Dark palettes switch on the app's dark: styles so every screen stays legible. */
  dark: boolean;
}

export const AMBIENT_PALETTES: Record<AmbientKey, AmbientPalette> = {
  dawn: {
    bg: "linear-gradient(180deg, oklch(0.80 0.07 25) 0%, oklch(0.88 0.06 55) 46%, oklch(0.94 0.035 85) 100%)",
    sun: "radial-gradient(circle, oklch(0.96 0.08 75 / 0.95) 0%, oklch(0.9 0.09 55 / 0.35) 38%, transparent 66%)",
    ink: "oklch(0.27 0.035 30)",
    muted: "oklch(0.40 0.045 35)",
    card: "oklch(0.985 0.012 60 / 0.62)",
    rail: "oklch(0.985 0.012 60 / 0.4)",
    well: "oklch(1 0 0 / 0.42)",
    sheet: "oklch(0.975 0.015 60)",
    border: "oklch(1 0 0 / 0.55)",
    shadow: "0 24px 60px oklch(0.35 0.08 30 / 0.14)",
    accent: "oklch(0.58 0.16 35)",
    accentInk: "oklch(0.99 0 0)",
    dark: false
  },
  morning: {
    bg: "linear-gradient(180deg, oklch(0.86 0.06 235) 0%, oklch(0.93 0.035 215) 52%, oklch(0.97 0.018 150) 100%)",
    sun: "radial-gradient(circle, oklch(0.99 0.045 95 / 0.95) 0%, oklch(0.96 0.06 90 / 0.4) 34%, transparent 64%)",
    ink: "oklch(0.25 0.035 250)",
    muted: "oklch(0.44 0.04 245)",
    card: "oklch(0.99 0.008 230 / 0.66)",
    rail: "oklch(0.99 0.008 230 / 0.42)",
    well: "oklch(1 0 0 / 0.45)",
    sheet: "oklch(0.98 0.01 230)",
    border: "oklch(1 0 0 / 0.6)",
    shadow: "0 24px 60px oklch(0.35 0.08 250 / 0.13)",
    accent: "oklch(0.56 0.15 245)",
    accentInk: "oklch(0.99 0 0)",
    dark: false
  },
  dusk: {
    bg: "linear-gradient(180deg, oklch(0.42 0.09 300) 0%, oklch(0.58 0.13 350) 50%, oklch(0.74 0.12 55) 100%)",
    sun: "radial-gradient(circle, oklch(0.88 0.13 65 / 0.85) 0%, oklch(0.75 0.15 40 / 0.35) 36%, transparent 64%)",
    ink: "oklch(0.97 0.015 60)",
    muted: "oklch(0.95 0.025 40)",
    card: "oklch(0.25 0.06 320 / 0.6)",
    rail: "oklch(0.28 0.06 320 / 0.32)",
    well: "oklch(1 0 0 / 0.08)",
    sheet: "oklch(0.3 0.06 320)",
    border: "oklch(1 0 0 / 0.16)",
    shadow: "0 24px 60px oklch(0.2 0.08 320 / 0.25)",
    accent: "oklch(0.86 0.13 70)",
    accentInk: "oklch(0.25 0.05 40)",
    dark: true
  },
  night: {
    bg: "linear-gradient(180deg, oklch(0.16 0.04 270) 0%, oklch(0.22 0.05 265) 56%, oklch(0.27 0.05 245) 100%)",
    sun: "radial-gradient(circle, oklch(0.93 0.02 250 / 0.5) 0%, oklch(0.7 0.05 250 / 0.12) 30%, transparent 60%)",
    ink: "oklch(0.94 0.012 260)",
    muted: "oklch(0.75 0.03 260)",
    card: "oklch(0.28 0.04 265 / 0.62)",
    rail: "oklch(0.28 0.04 265 / 0.45)",
    well: "oklch(1 0 0 / 0.05)",
    sheet: "oklch(0.24 0.04 265)",
    border: "oklch(1 0 0 / 0.08)",
    shadow: "0 24px 60px oklch(0.05 0.03 270 / 0.45)",
    accent: "oklch(0.8 0.11 210)",
    accentInk: "oklch(0.2 0.04 265)",
    dark: true
  }
};

/**
 * Which part of the day it is. The boundaries are generous on purpose: the
 * palette should feel like the light outside, not flip on an exact minute.
 */
export function ambientKeyFor(date: Date): AmbientKey {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17.5) return "morning";
  if (hour >= 17.5 && hour < 20.5) return "dusk";
  return "night";
}

export function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

/**
 * The palette for right now, plus the CSS variables to put on <main>.
 * `forceNight` is the rail's moon button: it pins the night palette.
 * Memoised on the palette key, so the once-a-second clock tick does not
 * rebuild the style object - the palette only changes a few times a day.
 */
export function useAmbient(now: Date, forceNight: boolean) {
  const key: AmbientKey = forceNight ? "night" : ambientKeyFor(now);
  return useMemo(() => {
    const palette = AMBIENT_PALETTES[key];
    const style = {
      "--amb-bg": palette.bg,
      "--amb-sun": palette.sun,
      "--amb-ink": palette.ink,
      "--amb-muted": palette.muted,
      "--amb-card": palette.card,
      "--amb-rail": palette.rail,
      "--amb-well": palette.well,
      "--amb-sheet": palette.sheet,
      "--amb-border": palette.border,
      "--amb-shadow": palette.shadow,
      "--amb-accent": palette.accent,
      "--amb-accent-ink": palette.accentInk
    } as CSSProperties;
    return { key, palette, style };
  }, [key]);
}
