import { GameMode, GameSettings, HighScores } from './types';

const SCORES_KEY = 'tetherline_scores_v1';
const SETTINGS_KEY = 'tetherline_settings_v1';

const DEFAULT_SCORES: HighScores = {
  standard: 0,
  zen: 0,
  overdrive: 0,
  bestCombo: 1,
  bestSector: 1,
};

function getDefaultReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function loadHighScores(): HighScores {
  try {
    const raw = window.localStorage.getItem(SCORES_KEY);
    if (!raw) return { ...DEFAULT_SCORES };
    const parsed = JSON.parse(raw) as Partial<HighScores>;
    return {
      standard: Number.isFinite(parsed.standard) ? Math.max(0, Math.floor(parsed.standard!)) : 0,
      zen: Number.isFinite(parsed.zen) ? Math.max(0, Math.floor(parsed.zen!)) : 0,
      overdrive: Number.isFinite(parsed.overdrive) ? Math.max(0, Math.floor(parsed.overdrive!)) : 0,
      bestCombo: Number.isFinite(parsed.bestCombo) ? Math.max(1, Math.floor(parsed.bestCombo!)) : 1,
      bestSector: Number.isFinite(parsed.bestSector) ? Math.max(1, Math.floor(parsed.bestSector!)) : 1,
    };
  } catch {
    return { ...DEFAULT_SCORES };
  }
}

export function saveRunScore(
  mode: GameMode,
  score: number,
  bestCombo: number,
  sectorReached: number
): { updated: HighScores; previousBest: number; isNewBest: boolean } {
  const current = loadHighScores();
  const previousBest = current[mode];
  const roundedScore = Math.max(0, Math.floor(score));
  const isNewBest = roundedScore > previousBest && roundedScore > 0;

  const updated: HighScores = {
    ...current,
    [mode]: Math.max(previousBest, roundedScore),
    bestCombo: Math.max(current.bestCombo, bestCombo),
    bestSector: Math.max(current.bestSector, sectorReached),
  };

  try {
    window.localStorage.setItem(SCORES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota or private-mode errors
  }

  return { updated, previousBest, isNewBest };
}

export function loadSettings(): GameSettings {
  const fallback: GameSettings = {
    muted: false,
    reducedMotion: getDefaultReducedMotion(),
    rumbleEnabled: true,
    showTrajectory: true,
  };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : fallback.muted,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : fallback.reducedMotion,
      rumbleEnabled:
        typeof parsed.rumbleEnabled === 'boolean' ? parsed.rumbleEnabled : fallback.rumbleEnabled,
      showTrajectory:
        typeof parsed.showTrajectory === 'boolean' ? parsed.showTrajectory : fallback.showTrajectory,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}
