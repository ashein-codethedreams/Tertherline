export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type GameMode = 'standard' | 'zen' | 'overdrive';

export type InputSource = 'keyboard_mouse' | 'touch' | 'gamepad';

export type GamepadFamily = 'xbox' | 'playstation' | 'switch' | 'standard';

export type AnchorKind = 'brass' | 'accelerator' | 'crystal';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Anchor {
  id: number;
  x: number;
  y: number;
  radius: number;
  kind: AnchorKind;
  pulsePhase: number;
  heat: number;
  shattered?: boolean;
}

export interface Shard {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  kind: 'prism' | 'repair';
  rotation: number;
  age: number;
  homing: boolean;
}

export interface Drone {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  kind: 'scout' | 'sweeper';
  angle: number;
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitAngle?: number;
  spawnWarmup: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface ChainSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  overdrive: boolean;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  latchedAnchorId: number | null;
  orbitRadius: number;
  orbitAngle: number;
  orbitDir: 1 | -1;
  angularSpeed: number;
  charge: number; // 0..1 while orbiting
  overdriveTimer: number; // seconds remaining of overdrive burst
  phaseCooldown: number; // seconds until phase ready
  phaseMaxCooldown: number;
  invulnTimer: number;
  shields: number;
  maxShields: number;
  lastAnchorId: number | null;
  chainCount: number;
  trail: TrailPoint[];
}

export interface HudSnapshot {
  score: number;
  combo: number;
  comboTimerRatio: number;
  sector: number;
  sectorName: string;
  sectorProgress: number;
  shields: number;
  maxShields: number;
  charge: number;
  overdriveActive: boolean;
  overdriveRatio: number;
  phaseReadyRatio: number;
  chainCount: number;
  mode: GameMode;
  elapsedSeconds: number;
}

export interface RunSummary {
  mode: GameMode;
  score: number;
  previousBest: number;
  isNewBest: boolean;
  shardsCollected: number;
  dronesSmashed: number;
  bestCombo: number;
  bestChain: number;
  sectorReached: number;
  elapsedSeconds: number;
}

export interface GameSettings {
  muted: boolean;
  reducedMotion: boolean;
  rumbleEnabled: boolean;
  showTrajectory: boolean;
}

export interface HighScores {
  standard: number;
  zen: number;
  overdrive: number;
  bestCombo: number;
  bestSector: number;
}

export interface ControllerInfo {
  connected: boolean;
  name: string;
  family: GamepadFamily;
}

export interface GamepadInputState {
  connected: boolean;
  moveX: number;
  moveY: number;
  latchHeld: boolean;
  latchJustPressed: boolean;
  phaseJustPressed: boolean;
  pauseJustPressed: boolean;
  menuLeftJustPressed: boolean;
  menuRightJustPressed: boolean;
  confirmJustPressed: boolean;
  cancelJustPressed: boolean;
  anyActivity: boolean;
}

export const MODE_META: Record<
  GameMode,
  {
    label: string;
    shortDesc: string;
    shields: number;
    scoreMult: number;
    speedScale: number;
  }
> = {
  standard: {
    label: 'Standard',
    shortDesc: '3 shields · Escalating sectors and sentinel drones',
    shields: 3,
    scoreMult: 1,
    speedScale: 1,
  },
  zen: {
    label: 'Zen Drift',
    shortDesc: 'No hazards · Pure rhythmic slingshot shard chaining',
    shields: 3,
    scoreMult: 0.75,
    speedScale: 0.92,
  },
  overdrive: {
    label: 'Overdrive',
    shortDesc: '1 shield · Faster drift and 2x score multiplier',
    shields: 1,
    scoreMult: 2,
    speedScale: 1.24,
  },
};

export const SECTOR_NAMES = [
  'Calibration',
  'Crosswind',
  'Twin Orbit',
  'Sentinel Grid',
  'Brass Meridian',
  'Apex Flux',
  'Solstice Core',
];
