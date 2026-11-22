import { soundEngine } from './audio';
import { gamepadManager } from './gamepad';
import {
  Anchor,
  AnchorKind,
  ChainSegment,
  Drone,
  FloatingText,
  GameMode,
  GameSettings,
  GameState,
  HudSnapshot,
  MODE_META,
  Particle,
  Player,
  RunSummary,
  SECTOR_NAMES,
  Shard,
  Shockwave,
} from './types';

export interface EngineInput {
  moveX: number;
  moveY: number;
  pointerX: number | null;
  pointerY: number | null;
  pointerActive: boolean;
  latchHeld: boolean;
  phaseTriggered: boolean;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onGameOver: (summary: RunSummary) => void;
}

const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 760;
const ARENA_MARGIN = 46;
const MAX_TETHER_RANGE = 295;
const MIN_ORBIT_RADIUS = 58;
const MAX_ORBIT_RADIUS = 195;
const BASE_CRUISE_SPEED = 245;
const MAX_SPEED = 690;
const OVERDRIVE_DURATION = 1.45;
const COMBO_WINDOW = 4.2;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export class TetherlineEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private state: GameState = 'TITLE_MENU';
  private mode: GameMode = 'standard';
  private settings: GameSettings;

  private width = LOGICAL_WIDTH;
  private height = LOGICAL_HEIGHT;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  private nextId = 1;
  private player: Player;
  private anchors: Anchor[] = [];
  private shards: Shard[] = [];
  private drones: Drone[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private floatingTexts: FloatingText[] = [];
  private chains: ChainSegment[] = [];

  private score = 0;
  private combo = 1;
  private comboTimer = 0;
  private bestCombo = 1;
  private bestChain = 0;
  private shardsCollected = 0;
  private dronesSmashed = 0;
  private sector = 1;
  private sectorScoreQuota = 650;
  private sectorStartScore = 0;
  private elapsedSeconds = 0;

  private droneSpawnTimer = 2.4;
  private shardSpawnTimer = 0.5;
  private repairSpawnCooldown = 14;
  private hitStopTimer = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private time = 0;

  private prevLatchHeld = false;
  private hudEmitAccum = 0;
  private demoHoldTimer = 0;
  private demoHolding = false;

  private previousBestForMode = 0;

  constructor(
    canvas: HTMLCanvasElement,
    settings: GameSettings,
    callbacks: EngineCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.settings = { ...settings };
    this.callbacks = callbacks;

    this.player = this.createDefaultPlayer();
    this.resize();
    this.initDemoWorld();
  }

  private createDefaultPlayer(): Player {
    const meta = MODE_META[this.mode];
    return {
      x: this.width * 0.5,
      y: this.height * 0.5,
      vx: BASE_CRUISE_SPEED * 0.9,
      vy: -BASE_CRUISE_SPEED * 0.45,
      radius: 13,
      latchedAnchorId: null,
      orbitRadius: 110,
      orbitAngle: 0,
      orbitDir: 1,
      angularSpeed: 0,
      charge: 0,
      overdriveTimer: 0,
      phaseCooldown: 0,
      phaseMaxCooldown: 2.1,
      invulnTimer: 1.2,
      shields: meta.shields,
      maxShields: meta.shields,
      lastAnchorId: null,
      chainCount: 0,
      trail: [],
    };
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
  }

  public setState(state: GameState): void {
    this.state = state;
    if (state === 'TITLE_MENU') {
      this.initDemoWorld();
    }
  }

  public startRun(mode: GameMode, previousBest: number): void {
    this.mode = mode;
    this.previousBestForMode = previousBest;
    this.state = 'PLAYING';
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.bestCombo = 1;
    this.bestChain = 0;
    this.shardsCollected = 0;
    this.dronesSmashed = 0;
    this.sector = 1;
    this.sectorStartScore = 0;
    this.sectorScoreQuota = 650;
    this.elapsedSeconds = 0;
    this.droneSpawnTimer = mode === 'overdrive' ? 1.5 : 2.3;
    this.shardSpawnTimer = 0.25;
    this.repairSpawnCooldown = 14;
    this.hitStopTimer = 0;
    this.shakeTimer = 0;
    this.prevLatchHeld = false;

    this.shards = [];
    this.drones = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.chains = [];

    this.player = this.createDefaultPlayer();
    this.player.x = this.width * 0.36;
    this.player.y = this.height * 0.56;
    this.player.vx = 250;
    this.player.vy = -120;

    this.generateAnchorLayout(1);
    this.spawnShardArc(3);
    this.emitHud();
  }

  private initDemoWorld(): void {
    this.mode = 'standard';
    this.shards = [];
    this.drones = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.chains = [];
    this.player = this.createDefaultPlayer();
    this.player.x = this.width * 0.62;
    this.player.y = this.height * 0.44;
    this.player.vx = 220;
    this.player.vy = 145;
    this.generateAnchorLayout(2);
    this.spawnShardArc(2);
    this.demoHolding = false;
    this.demoHoldTimer = 0.4;
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const scaleX = rect.width / LOGICAL_WIDTH;
    const scaleY = rect.height / LOGICAL_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (rect.width - LOGICAL_WIDTH * this.scale) * 0.5;
    this.offsetY = (rect.height - LOGICAL_HEIGHT * this.scale) * 0.5;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public clientToLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return {
      x: (px - this.offsetX) / this.scale,
      y: (py - this.offsetY) / this.scale,
    };
  }

  private generateAnchorLayout(sector: number): void {
    const anchors: Anchor[] = [];
    const cols = 4;
    const rows = 2;
    const padX = 185;
    const padY = 175;
    const usableW = LOGICAL_WIDTH - padX * 2;
    const usableH = LOGICAL_HEIGHT - padY * 2;

    // Center hub anchor
    anchors.push({
      id: this.nextId++,
      x: LOGICAL_WIDTH * 0.5,
      y: LOGICAL_HEIGHT * 0.5,
      radius: 17,
      kind: sector >= 2 ? 'accelerator' : 'brass',
      pulsePhase: Math.random() * Math.PI * 2,
      heat: 0,
    });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const baseX = padX + (usableW / (cols - 1)) * c;
        const baseY = padY + (usableH / (rows - 1)) * r;
        const jitterX = (Math.random() - 0.5) * 68;
        const jitterY = (Math.random() - 0.5) * 58;
        const x = clamp(baseX + jitterX, ARENA_MARGIN + 90, LOGICAL_WIDTH - ARENA_MARGIN - 90);
        const y = clamp(baseY + jitterY, ARENA_MARGIN + 90, LOGICAL_HEIGHT - ARENA_MARGIN - 90);

        if (dist(x, y, LOGICAL_WIDTH * 0.5, LOGICAL_HEIGHT * 0.5) < 165) continue;

        let kind: AnchorKind = 'brass';
        const roll = Math.random();
        if (roll < 0.22 + Math.min(0.14, sector * 0.025)) {
          kind = 'accelerator';
        } else if (roll > 0.78) {
          kind = 'crystal';
        }

        anchors.push({
          id: this.nextId++,
          x,
          y,
          radius: kind === 'accelerator' ? 16 : 14,
          kind,
          pulsePhase: Math.random() * Math.PI * 2,
          heat: 0,
        });
      }
    }

    this.anchors = anchors;
  }

  private respawnCrystalAnchor(oldX: number, oldY: number): void {
    // Respawn a fresh anchor in an open region away from the shattered one
    for (let tries = 0; tries < 18; tries++) {
      const x = ARENA_MARGIN + 110 + Math.random() * (LOGICAL_WIDTH - (ARENA_MARGIN + 110) * 2);
      const y = ARENA_MARGIN + 100 + Math.random() * (LOGICAL_HEIGHT - (ARENA_MARGIN + 100) * 2);
      if (dist(x, y, oldX, oldY) < 140) continue;
      const tooClose = this.anchors.some((a) => dist(a.x, a.y, x, y) < 165);
      if (!tooClose) {
        this.anchors.push({
          id: this.nextId++,
          x,
          y,
          radius: 14,
          kind: Math.random() < 0.65 ? 'crystal' : 'accelerator',
          pulsePhase: 0,
          heat: 0,
        });
        this.spawnShockwave(x, y, 52, '#2DD4BF', 1.5);
        return;
      }
    }
  }

  private spawnShardArc(countClusters = 1): void {
    for (let n = 0; n < countClusters; n++) {
      if (this.shards.length >= 24) return;
      if (this.anchors.length === 0) return;

      const anchor = this.anchors[Math.floor(Math.random() * this.anchors.length)];
      const orbitR = 78 + Math.random() * 58;
      const startAngle = Math.random() * Math.PI * 2;
      const arcCount = 4 + Math.floor(Math.random() * 2);
      const step = 0.34;

      for (let i = 0; i < arcCount; i++) {
        const a = startAngle + i * step;
        const sx = clamp(anchor.x + Math.cos(a) * orbitR, ARENA_MARGIN + 28, LOGICAL_WIDTH - ARENA_MARGIN - 28);
        const sy = clamp(anchor.y + Math.sin(a) * orbitR, ARENA_MARGIN + 28, LOGICAL_HEIGHT - ARENA_MARGIN - 28);
        this.shards.push({
          id: this.nextId++,
          x: sx,
          y: sy,
          vx: 0,
          vy: 0,
          value: 45,
          kind: 'prism',
          rotation: a + Math.PI * 0.5,
          age: 0,
          homing: false,
        });
      }
    }
  }

  private spawnRepairShard(): void {
    const x = ARENA_MARGIN + 120 + Math.random() * (LOGICAL_WIDTH - (ARENA_MARGIN + 120) * 2);
    const y = ARENA_MARGIN + 110 + Math.random() * (LOGICAL_HEIGHT - (ARENA_MARGIN + 110) * 2);
    this.shards.push({
      id: this.nextId++,
      x,
      y,
      vx: 0,
      vy: 0,
      value: 100,
      kind: 'repair',
      rotation: 0,
      age: 0,
      homing: false,
    });
    this.spawnShockwave(x, y, 56, '#2DD4BF', 2);
  }

  private spawnDrone(): void {
    if (this.mode === 'zen') return;
    const maxDrones = Math.min(9, 2 + this.sector + (this.mode === 'overdrive' ? 2 : 0));
    if (this.drones.length >= maxDrones) return;

    const isSweeper = this.sector >= 2 && Math.random() < 0.34;

    if (isSweeper && this.anchors.length > 0) {
      const anchor = this.anchors[Math.floor(Math.random() * this.anchors.length)];
      const orbitR = 115 + Math.random() * 55;
      const startAngle = Math.random() * Math.PI * 2;
      const sx = clamp(anchor.x + Math.cos(startAngle) * orbitR, ARENA_MARGIN + 36, LOGICAL_WIDTH - ARENA_MARGIN - 36);
      const sy = clamp(anchor.y + Math.sin(startAngle) * orbitR, ARENA_MARGIN + 36, LOGICAL_HEIGHT - ARENA_MARGIN - 36);

      if (dist(sx, sy, this.player.x, this.player.y) < 170) return;

      this.drones.push({
        id: this.nextId++,
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        radius: 14,
        kind: 'sweeper',
        angle: startAngle,
        orbitCenterX: anchor.x,
        orbitCenterY: anchor.y,
        orbitRadius: orbitR,
        orbitSpeed: (Math.random() < 0.5 ? 1 : -1) * (1.15 + this.sector * 0.14),
        orbitAngle: startAngle,
        spawnWarmup: 0.95,
      });
      return;
    }

    // Spawn scout from perimeter edges away from player
    const edge = Math.floor(Math.random() * 4);
    let sx = ARENA_MARGIN + 24;
    let sy = ARENA_MARGIN + 24;
    if (edge === 0) {
      sx = ARENA_MARGIN + 40 + Math.random() * (LOGICAL_WIDTH - (ARENA_MARGIN + 40) * 2);
      sy = ARENA_MARGIN + 24;
    } else if (edge === 1) {
      sx = LOGICAL_WIDTH - ARENA_MARGIN - 24;
      sy = ARENA_MARGIN + 40 + Math.random() * (LOGICAL_HEIGHT - (ARENA_MARGIN + 40) * 2);
    } else if (edge === 2) {
      sx = ARENA_MARGIN + 40 + Math.random() * (LOGICAL_WIDTH - (ARENA_MARGIN + 40) * 2);
      sy = LOGICAL_HEIGHT - ARENA_MARGIN - 24;
    } else {
      sx = ARENA_MARGIN + 24;
      sy = ARENA_MARGIN + 40 + Math.random() * (LOGICAL_HEIGHT - (ARENA_MARGIN + 40) * 2);
    }

    if (dist(sx, sy, this.player.x, this.player.y) < 190) return;

    const angle = Math.atan2(this.player.y - sy, this.player.x - sx);
    const speed = (86 + this.sector * 13) * MODE_META[this.mode].speedScale;
    this.drones.push({
      id: this.nextId++,
      x: sx,
      y: sy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 13,
      kind: 'scout',
      angle,
      spawnWarmup: 0.9,
    });
  }

  private findBestTargetAnchor(input: EngineInput): Anchor | null {
    let best: Anchor | null = null;
    let bestScore = Infinity;

    const speed = Math.hypot(this.player.vx, this.player.vy) || 1;
    let aimX = this.player.vx / speed;
    let aimY = this.player.vy / speed;

    if (Math.hypot(input.moveX, input.moveY) > 0.25) {
      const m = Math.hypot(input.moveX, input.moveY);
      aimX = input.moveX / m;
      aimY = input.moveY / m;
    } else if (input.pointerActive && input.pointerX !== null && input.pointerY !== null) {
      const dx = input.pointerX - this.player.x;
      const dy = input.pointerY - this.player.y;
      const dm = Math.hypot(dx, dy);
      if (dm > 20) {
        aimX = dx / dm;
        aimY = dy / dm;
      }
    }

    for (const anchor of this.anchors) {
      const d = dist(this.player.x, this.player.y, anchor.x, anchor.y);
      if (d > MAX_TETHER_RANGE || d < 28) continue;

      const toX = (anchor.x - this.player.x) / d;
      const toY = (anchor.y - this.player.y) / d;
      const alignment = toX * aimX + toY * aimY; // -1..1

      // Favor closer anchors, gently biased toward aim direction & new anchors for chaining
      let score = d - alignment * 58;
      if (anchor.id === this.player.lastAnchorId) {
        score += 36;
      }
      if (score < bestScore) {
        bestScore = score;
        best = anchor;
      }
    }
    return best;
  }

  private latchToAnchor(anchor: Anchor, silent = false): void {
    const p = this.player;
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    const currentDist = Math.max(MIN_ORBIT_RADIUS, Math.min(MAX_ORBIT_RADIUS, Math.hypot(dx, dy)));

    p.latchedAnchorId = anchor.id;
    p.orbitRadius = currentDist;
    p.orbitAngle = Math.atan2(dy, dx);

    // Cross product determines natural orbit direction (CW or CCW)
    const cross = dx * p.vy - dy * p.vx;
    p.orbitDir = cross >= 0 ? 1 : -1;

    const currentSpeed = Math.max(BASE_CRUISE_SPEED * 1.05, Math.hypot(p.vx, p.vy));
    p.angularSpeed = clamp(currentSpeed / p.orbitRadius, 2.5, 6.4);
    p.charge = Math.max(p.charge * 0.35, p.overdriveTimer > 0 ? 0.45 : 0.12);

    // Chain bonus when latching a different anchor consecutively
    if (p.lastAnchorId !== null && p.lastAnchorId !== anchor.id) {
      const prevAnchor = this.anchors.find((a) => a.id === p.lastAnchorId);
      p.chainCount += 1;
      if (p.chainCount > this.bestChain) this.bestChain = p.chainCount;
      if (prevAnchor) {
        this.chains.push({
          x1: prevAnchor.x,
          y1: prevAnchor.y,
          x2: anchor.x,
          y2: anchor.y,
          life: 1.1,
          maxLife: 1.1,
        });
      }
      if (this.state === 'PLAYING' && p.chainCount >= 2) {
        const chainBonus = Math.round(25 * p.chainCount * MODE_META[this.mode].scoreMult);
        this.addScore(chainBonus);
        this.spawnFloatingText(anchor.x, anchor.y - 26, `Chain ×${p.chainCount} +${chainBonus}`, '#F5A623');
      }
    } else if (p.lastAnchorId === null) {
      p.chainCount = 1;
    }

    anchor.heat = 1;

    if (!silent) {
      soundEngine.playLatch(p.chainCount);
      gamepadManager.rumble(45, 0.2, 0.1);
      this.spawnShockwave(anchor.x, anchor.y, 44, anchor.kind === 'crystal' ? '#2DD4BF' : '#F5A623', 2);
    }
  }

  private releaseLatch(silent = false): void {
    const p = this.player;
    if (p.latchedAnchorId === null) return;

    const anchor = this.anchors.find((a) => a.id === p.latchedAnchorId);
    const tangentAngle = p.orbitAngle + (p.orbitDir * Math.PI) / 2;

    const chargeRatio = clamp(p.charge, 0, 1);
    const isOverdriveLaunch = chargeRatio >= 0.68 || p.overdriveTimer > 0;
    const speedScale = MODE_META[this.mode].speedScale;
    const launchSpeed = clamp(
      (BASE_CRUISE_SPEED + chargeRatio * 290 + (isOverdriveLaunch ? 90 : 0)) * speedScale,
      BASE_CRUISE_SPEED,
      MAX_SPEED
    );

    p.vx = Math.cos(tangentAngle) * launchSpeed;
    p.vy = Math.sin(tangentAngle) * launchSpeed;
    p.lastAnchorId = p.latchedAnchorId;
    p.latchedAnchorId = null;

    if (isOverdriveLaunch) {
      p.overdriveTimer = Math.max(p.overdriveTimer, OVERDRIVE_DURATION * (0.78 + chargeRatio * 0.45));
      if (!silent) {
        this.spawnShockwave(p.x, p.y, 64, '#F5A623', 2.5);
        this.spawnBurst(p.x, p.y, '#F5A623', 14, 210);
        gamepadManager.rumble(85, 0.45, 0.25);
      }
    } else if (!silent) {
      this.spawnBurst(p.x, p.y, '#E8C47C', 6, 120);
    }

    // Crystal anchor shatters into 3 homing bonus shards on release!
    if (anchor && anchor.kind === 'crystal') {
      this.anchors = this.anchors.filter((a) => a.id !== anchor.id);
      this.spawnBurst(anchor.x, anchor.y, '#2DD4BF', 18, 220);
      this.spawnShockwave(anchor.x, anchor.y, 76, '#2DD4BF', 2.2);
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3 + Math.random() * 0.4;
        this.shards.push({
          id: this.nextId++,
          x: anchor.x + Math.cos(a) * 18,
          y: anchor.y + Math.sin(a) * 18,
          vx: Math.cos(a) * 120,
          vy: Math.sin(a) * 120,
          value: 75,
          kind: 'prism',
          rotation: a,
          age: 0,
          homing: true,
        });
      }
      this.respawnCrystalAnchor(anchor.x, anchor.y);
    }

    p.charge = 0;

    if (!silent) {
      soundEngine.playRelease(isOverdriveLaunch);
    }
  }

  private triggerPhase(input: EngineInput): void {
    const p = this.player;
    if (p.phaseCooldown > 0) return;

    p.phaseCooldown = p.phaseMaxCooldown;
    soundEngine.playPhaseBlink();
    gamepadManager.rumble(70, 0.35, 0.2);

    if (p.latchedAnchorId !== null) {
      // Polarity flip: reverse orbit direction immediately + charge boost
      p.orbitDir = p.orbitDir === 1 ? -1 : 1;
      p.charge = clamp(p.charge + 0.32, 0, 1);
      p.angularSpeed = Math.min(6.8, p.angularSpeed + 0.7);
      p.invulnTimer = Math.max(p.invulnTimer, 0.28);
      this.spawnShockwave(p.x, p.y, 58, '#2DD4BF', 2.2);
      this.spawnBurst(p.x, p.y, '#2DD4BF', 12, 190);
      this.spawnFloatingText(p.x, p.y - 24, 'Phase Flip', '#2DD4BF');
      return;
    }

    // Unlatched: short invulnerable Phase Blink along steer/velocity direction
    let dirX = p.vx;
    let dirY = p.vy;
    if (Math.hypot(input.moveX, input.moveY) > 0.25) {
      dirX = input.moveX;
      dirY = input.moveY;
    }
    const mag = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / mag;
    const ny = dirY / mag;

    const startX = p.x;
    const startY = p.y;
    const blinkDist = 115;

    this.spawnShockwave(startX, startY, 44, '#2DD4BF', 2);
    this.spawnBurst(startX, startY, '#2DD4BF', 10, 160);

    p.x = clamp(p.x + nx * blinkDist, ARENA_MARGIN + p.radius, LOGICAL_WIDTH - ARENA_MARGIN - p.radius);
    p.y = clamp(p.y + ny * blinkDist, ARENA_MARGIN + p.radius, LOGICAL_HEIGHT - ARENA_MARGIN - p.radius);

    const newSpeed = Math.max(Math.hypot(p.vx, p.vy), BASE_CRUISE_SPEED * 1.45);
    p.vx = nx * newSpeed;
    p.vy = ny * newSpeed;
    p.invulnTimer = Math.max(p.invulnTimer, 0.38);
    p.overdriveTimer = Math.max(p.overdriveTimer, 0.45);

    this.chains.push({
      x1: startX,
      y1: startY,
      x2: p.x,
      y2: p.y,
      life: 0.45,
      maxLife: 0.45,
    });
    this.spawnShockwave(p.x, p.y, 54, '#2DD4BF', 2.2);
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score >= this.sectorStartScore + this.sectorScoreQuota) {
      this.sector += 1;
      this.sectorStartScore = this.score;
      this.sectorScoreQuota = Math.round(650 + this.sector * 360);
      soundEngine.playSectorUp();
      gamepadManager.rumble(140, 0.4, 0.45);
      const name = SECTOR_NAMES[(this.sector - 1) % SECTOR_NAMES.length];
      this.spawnFloatingText(LOGICAL_WIDTH * 0.5, 115, `Sector ${this.sector} · ${name}`, '#F5A623');
      this.spawnShockwave(this.player.x, this.player.y, 180, '#F5A623', 2);
      this.spawnShardArc(2);
    }
  }

  private spawnBurst(x: number, y: number, color: string, count: number, maxSpeed: number): void {
    const actualCount = this.settings.reducedMotion ? Math.ceil(count * 0.4) : count;
    for (let i = 0; i < actualCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * maxSpeed;
      const maxLife = 0.28 + Math.random() * 0.38;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 2 + Math.random() * 3.2,
        color,
        alpha: 1,
        life: maxLife,
        maxLife,
      });
    }
  }

  private spawnShockwave(x: number, y: number, maxRadius: number, color: string, lineWidth = 2): void {
    this.shockwaves.push({
      x,
      y,
      radius: 10,
      maxRadius: this.settings.reducedMotion ? maxRadius * 0.65 : maxRadius,
      color,
      alpha: 0.85,
      lineWidth,
    });
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 0.95,
      maxLife: 0.95,
    });
  }

  private triggerShake(intensity: number, duration: number): void {
    if (this.settings.reducedMotion) return;
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  private computeDemoInput(dt: number): EngineInput {
    this.demoHoldTimer -= dt;
    const p = this.player;

    if (this.demoHolding) {
      if (p.charge >= 0.72 || this.demoHoldTimer <= 0) {
        this.demoHolding = false;
        this.demoHoldTimer = 0.65 + Math.random() * 0.45;
      }
    } else {
      const nearest = this.anchors.reduce<Anchor | null>((best, a) => {
        if (a.id === p.lastAnchorId) return best;
        const d = dist(p.x, p.y, a.x, a.y);
        if (d > MAX_TETHER_RANGE * 0.85 || d < 65) return best;
        if (!best) return a;
        return d < dist(p.x, p.y, best.x, best.y) ? a : best;
      }, null);

      if (nearest && this.demoHoldTimer <= 0) {
        this.demoHolding = true;
        this.demoHoldTimer = 0.75 + Math.random() * 0.45;
      }
    }

    return {
      moveX: 0,
      moveY: 0,
      pointerX: null,
      pointerY: null,
      pointerActive: false,
      latchHeld: this.demoHolding,
      phaseTriggered: false,
    };
  }

  public step(rawDt: number, input: EngineInput): void {
    const dt = Math.min(rawDt, 0.05);
    this.time += dt;

    if (this.state === 'PAUSED' || this.state === 'GAME_OVER') {
      this.render(input);
      return;
    }

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this.updateEffectsOnly(dt * 0.35);
      this.render(input);
      return;
    }

    const isDemo = this.state === 'TITLE_MENU';
    const activeInput = isDemo ? this.computeDemoInput(dt) : input;

    if (!isDemo) {
      this.elapsedSeconds += dt;
    }

    const p = this.player;
    const speedScale = MODE_META[this.mode].speedScale;

    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.phaseCooldown > 0) p.phaseCooldown = Math.max(0, p.phaseCooldown - dt);
    if (p.overdriveTimer > 0) p.overdriveTimer = Math.max(0, p.overdriveTimer - dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
        this.comboTimer = 0;
      }
    }

    // Handle Phase trigger
    if (!isDemo && activeInput.phaseTriggered) {
      this.triggerPhase(activeInput);
    }

    // Handle Latch press & release
    if (activeInput.latchHeld && !this.prevLatchHeld && p.latchedAnchorId === null) {
      const target = this.findBestTargetAnchor(activeInput);
      if (target) {
        this.latchToAnchor(target, isDemo);
      }
    } else if (activeInput.latchHeld && p.latchedAnchorId === null) {
      // Allow catching an anchor as soon as player enters range while holding button
      const target = this.findBestTargetAnchor(activeInput);
      if (target && dist(p.x, p.y, target.x, target.y) < MAX_TETHER_RANGE * 0.92) {
        this.latchToAnchor(target, isDemo);
      }
    } else if (!activeInput.latchHeld && p.latchedAnchorId !== null) {
      this.releaseLatch(isDemo);
    }
    this.prevLatchHeld = activeInput.latchHeld;

    // Player movement
    if (p.latchedAnchorId !== null) {
      const anchor = this.anchors.find((a) => a.id === p.latchedAnchorId);
      if (!anchor) {
        this.releaseLatch(isDemo);
      } else {
        const accelFactor = anchor.kind === 'accelerator' ? 2.15 : 1.0;
        // Gently pull orbit radius toward sweet spot
        const targetRadius = clamp(p.orbitRadius, 74, 158);
        p.orbitRadius += (targetRadius - p.orbitRadius) * Math.min(1, dt * 3.5);

        // Increase angular speed & charge
        const maxAng = (anchor.kind === 'accelerator' ? 6.8 : 5.3) * speedScale;
        p.angularSpeed = Math.min(maxAng, p.angularSpeed + dt * 2.1 * accelFactor);
        p.charge = clamp(p.charge + dt * 0.72 * accelFactor, 0, 1);
        p.orbitAngle += p.orbitDir * p.angularSpeed * dt;

        p.x = anchor.x + Math.cos(p.orbitAngle) * p.orbitRadius;
        p.y = anchor.y + Math.sin(p.orbitAngle) * p.orbitRadius;

        // Keep velocity synced to tangent
        const tangentAngle = p.orbitAngle + (p.orbitDir * Math.PI) / 2;
        const tangentialSpeed = p.angularSpeed * p.orbitRadius;
        p.vx = Math.cos(tangentAngle) * tangentialSpeed;
        p.vy = Math.sin(tangentAngle) * tangentialSpeed;

        // Soft arena clamp if anchor is near edge
        if (
          p.x < ARENA_MARGIN + p.radius ||
          p.x > LOGICAL_WIDTH - ARENA_MARGIN - p.radius ||
          p.y < ARENA_MARGIN + p.radius ||
          p.y > LOGICAL_HEIGHT - ARENA_MARGIN - p.radius
        ) {
          p.orbitRadius = Math.max(MIN_ORBIT_RADIUS, p.orbitRadius - 42 * dt);
          p.x = clamp(p.x, ARENA_MARGIN + p.radius, LOGICAL_WIDTH - ARENA_MARGIN - p.radius);
          p.y = clamp(p.y, ARENA_MARGIN + p.radius, LOGICAL_HEIGHT - ARENA_MARGIN - p.radius);
        }
      }
    } else {
      // Free flight with gentle steering nudge
      const steerAccel = 410;
      if (Math.hypot(activeInput.moveX, activeInput.moveY) > 0.1) {
        p.vx += activeInput.moveX * steerAccel * dt;
        p.vy += activeInput.moveY * steerAccel * dt;
      }

      // Gentle drag toward cruise speed (never stalls)
      const currentSpeed = Math.hypot(p.vx, p.vy) || 1;
      const minCruise = BASE_CRUISE_SPEED * speedScale;
      if (currentSpeed > minCruise) {
        const drag = p.overdriveTimer > 0 ? 0.45 : 1.05;
        const nextSpeed = Math.max(minCruise, currentSpeed - currentSpeed * drag * dt);
        p.vx = (p.vx / currentSpeed) * nextSpeed;
        p.vy = (p.vy / currentSpeed) * nextSpeed;
      } else if (currentSpeed < minCruise) {
        const boost = Math.min(minCruise, currentSpeed + 280 * dt);
        p.vx = (p.vx / currentSpeed) * boost;
        p.vy = (p.vy / currentSpeed) * boost;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Elastic wall ricochet
      let bounced = false;
      if (p.x < ARENA_MARGIN + p.radius) {
        p.x = ARENA_MARGIN + p.radius;
        p.vx = Math.abs(p.vx) * 0.94;
        bounced = true;
      } else if (p.x > LOGICAL_WIDTH - ARENA_MARGIN - p.radius) {
        p.x = LOGICAL_WIDTH - ARENA_MARGIN - p.radius;
        p.vx = -Math.abs(p.vx) * 0.94;
        bounced = true;
      }
      if (p.y < ARENA_MARGIN + p.radius) {
        p.y = ARENA_MARGIN + p.radius;
        p.vy = Math.abs(p.vy) * 0.94;
        bounced = true;
      } else if (p.y > LOGICAL_HEIGHT - ARENA_MARGIN - p.radius) {
        p.y = LOGICAL_HEIGHT - ARENA_MARGIN - p.radius;
        p.vy = -Math.abs(p.vy) * 0.94;
        bounced = true;
      }
      if (bounced) {
        p.chainCount = 0;
        p.lastAnchorId = null;
        if (!isDemo) {
          this.spawnBurst(p.x, p.y, '#D6B376', 6, 120);
        }
      }
    }

    // Record ribbon trail
    const isOverdrive = p.overdriveTimer > 0 || (p.latchedAnchorId !== null && p.charge >= 0.85);
    p.trail.push({ x: p.x, y: p.y, overdrive: isOverdrive });
    if (p.trail.length > 26) {
      p.trail.shift();
    }

    // Update anchors
    for (const anchor of this.anchors) {
      anchor.pulsePhase += dt * (anchor.kind === 'accelerator' ? 3.2 : 1.7);
      if (anchor.heat > 0) anchor.heat = Math.max(0, anchor.heat - dt * 1.4);
    }

    // Update shards & collect
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.age += dt;
      s.rotation += dt * 1.3;

      const d = dist(p.x, p.y, s.x, s.y);
      const magnetRadius = isOverdrive ? 120 : 82;

      if (s.homing || d < magnetRadius) {
        const pull = s.homing ? 540 : 410;
        const dx = (p.x - s.x) / (d || 1);
        const dy = (p.y - s.y) / (d || 1);
        s.vx += dx * pull * dt * 3.5;
        s.vy += dy * pull * dt * 3.5;
        const spd = Math.hypot(s.vx, s.vy);
        if (spd > 480) {
          s.vx = (s.vx / spd) * 480;
          s.vy = (s.vy / spd) * 480;
        }
      } else {
        s.vx *= 1 - Math.min(1, dt * 3);
        s.vy *= 1 - Math.min(1, dt * 3);
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (d < p.radius + 14) {
        this.shards.splice(i, 1);
        if (isDemo) {
          this.spawnBurst(s.x, s.y, '#F5A623', 6, 110);
          continue;
        }

        if (s.kind === 'repair') {
          if (p.shields < p.maxShields) {
            p.shields += 1;
            this.spawnFloatingText(s.x, s.y - 14, '+1 Shield', '#2DD4BF');
          } else {
            const pts = Math.round(150 * this.combo * MODE_META[this.mode].scoreMult);
            this.addScore(pts);
            this.spawnFloatingText(s.x, s.y - 14, `+${pts}`, '#2DD4BF');
          }
          soundEngine.playRepair();
          this.spawnBurst(s.x, s.y, '#2DD4BF', 14, 180);
          this.spawnShockwave(s.x, s.y, 60, '#2DD4BF', 2);
          continue;
        }

        this.shardsCollected += 1;
        this.combo = Math.min(12, this.combo + 1);
        if (this.combo > this.bestCombo) this.bestCombo = this.combo;
        this.comboTimer = COMBO_WINDOW;

        const pts = Math.round(s.value * this.combo * MODE_META[this.mode].scoreMult);
        this.addScore(pts);
        if (p.overdriveTimer > 0) {
          p.overdriveTimer = Math.min(OVERDRIVE_DURATION * 1.4, p.overdriveTimer + 0.14);
        }

        soundEngine.playShard(this.combo);
        this.spawnBurst(s.x, s.y, '#F5A623', 8, 145);
        this.spawnFloatingText(s.x, s.y - 12, `+${pts}`, '#F7D08A');
      }
    }

    // Spawning shards
    this.shardSpawnTimer -= dt;
    if (this.shardSpawnTimer <= 0 && this.shards.length < 14) {
      this.spawnShardArc(1);
      this.shardSpawnTimer = 2.6;
    }

    // Spawning repair core when hurt in standard mode
    if (!isDemo && this.mode === 'standard' && p.shields < p.maxShields) {
      this.repairSpawnCooldown -= dt;
      if (this.repairSpawnCooldown <= 0 && !this.shards.some((s) => s.kind === 'repair')) {
        this.spawnRepairShard();
        this.repairSpawnCooldown = 19;
      }
    }

    // Update & spawn drones (not in demo or zen mode)
    if (!isDemo && this.mode !== 'zen') {
      this.droneSpawnTimer -= dt;
      if (this.droneSpawnTimer <= 0) {
        this.spawnDrone();
        const baseInterval = this.mode === 'overdrive' ? 2.1 : 3.0;
        this.droneSpawnTimer = Math.max(1.15, baseInterval - this.sector * 0.22);
      }

      for (let i = this.drones.length - 1; i >= 0; i--) {
        const d = this.drones[i];
        if (d.spawnWarmup > 0) {
          d.spawnWarmup = Math.max(0, d.spawnWarmup - dt);
          continue;
        }

        if (d.kind === 'sweeper' && d.orbitCenterX !== undefined && d.orbitCenterY !== undefined && d.orbitRadius !== undefined && d.orbitSpeed !== undefined && d.orbitAngle !== undefined) {
          d.orbitAngle += d.orbitSpeed * dt;
          d.x = d.orbitCenterX + Math.cos(d.orbitAngle) * d.orbitRadius;
          d.y = d.orbitCenterY + Math.sin(d.orbitAngle) * d.orbitRadius;
          d.angle = d.orbitAngle + (d.orbitSpeed > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        } else {
          // Scout softly homes toward player
          const desiredAngle = Math.atan2(p.y - d.y, p.x - d.x);
          const currentSpd = Math.hypot(d.vx, d.vy) || 100;
          const curAngle = Math.atan2(d.vy, d.vx);
          let diff = desiredAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turnRate = 1.45 * dt;
          const nextAngle = curAngle + clamp(diff, -turnRate, turnRate);
          d.vx = Math.cos(nextAngle) * currentSpd;
          d.vy = Math.sin(nextAngle) * currentSpd;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.angle = nextAngle;

          // Keep scouts inside arena
          if (d.x < ARENA_MARGIN + d.radius || d.x > LOGICAL_WIDTH - ARENA_MARGIN - d.radius) {
            d.vx = -d.vx;
            d.x = clamp(d.x, ARENA_MARGIN + d.radius, LOGICAL_WIDTH - ARENA_MARGIN - d.radius);
          }
          if (d.y < ARENA_MARGIN + d.radius || d.y > LOGICAL_HEIGHT - ARENA_MARGIN - d.radius) {
            d.vy = -d.vy;
            d.y = clamp(d.y, ARENA_MARGIN + d.radius, LOGICAL_HEIGHT - ARENA_MARGIN - d.radius);
          }
        }

        // Collision with player
        const hitDist = dist(p.x, p.y, d.x, d.y);
        if (hitDist < p.radius + d.radius + 3) {
          if (isOverdrive) {
            // SMASH!
            this.drones.splice(i, 1);
            this.dronesSmashed += 1;
            this.combo = Math.min(12, this.combo + 2);
            if (this.combo > this.bestCombo) this.bestCombo = this.combo;
            this.comboTimer = COMBO_WINDOW;
            p.overdriveTimer = Math.min(OVERDRIVE_DURATION * 1.45, p.overdriveTimer + 0.45);

            const smashPts = Math.round(160 * this.combo * MODE_META[this.mode].scoreMult);
            this.addScore(smashPts);

            soundEngine.playSmash();
            gamepadManager.rumble(130, 0.7, 0.55);
            this.triggerShake(7, 0.16);
            this.hitStopTimer = this.settings.reducedMotion ? 0 : 0.05;

            this.spawnBurst(d.x, d.y, '#EF5350', 18, 280);
            this.spawnBurst(d.x, d.y, '#F5A623', 10, 220);
            this.spawnShockwave(d.x, d.y, 110, '#F5A623', 2.8);
            this.spawnFloatingText(d.x, d.y - 18, `Smash +${smashPts}`, '#F5A623');
          } else if (p.invulnTimer <= 0) {
            // Take shield damage
            this.drones.splice(i, 1);
            p.shields -= 1;
            p.invulnTimer = 1.6;
            p.chainCount = 0;
            this.combo = 1;
            this.comboTimer = 0;
            this.releaseLatch(true);

            soundEngine.playShieldHit();
            gamepadManager.rumble(210, 0.85, 0.85);
            this.triggerShake(11, 0.25);
            this.spawnBurst(p.x, p.y, '#EF5350', 20, 240);
            this.spawnShockwave(p.x, p.y, 125, '#EF5350', 3);

            // Clear nearby drones softly for breathing room
            for (let j = this.drones.length - 1; j >= 0; j--) {
              if (dist(p.x, p.y, this.drones[j].x, this.drones[j].y) < 165) {
                this.spawnBurst(this.drones[j].x, this.drones[j].y, '#EF5350', 8, 150);
                this.drones.splice(j, 1);
              }
            }

            if (p.shields <= 0) {
              this.finishRun();
              return;
            }
          }
        }
      }
    }

    this.updateEffectsOnly(dt);

    if (!isDemo) {
      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.065) {
        this.hudEmitAccum = 0;
        this.emitHud();
      }
    }

    this.render(activeInput);
  }

  private updateEffectsOnly(dt: number): void {
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - Math.min(1, dt * 3.4);
      pt.vy *= 1 - Math.min(1, dt * 3.4);
      pt.alpha = pt.life / pt.maxLife;
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += (sw.maxRadius - sw.radius) * Math.min(1, dt * 8.5) + 40 * dt;
      sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
      if (sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y -= 28 * dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    for (let i = this.chains.length - 1; i >= 0; i--) {
      this.chains[i].life -= dt;
      if (this.chains[i].life <= 0) {
        this.chains.splice(i, 1);
      }
    }
  }

  private finishRun(): void {
    this.state = 'GAME_OVER';
    soundEngine.playGameOver();
    this.emitHud();
    const roundedScore = Math.floor(this.score);
    this.callbacks.onGameOver({
      mode: this.mode,
      score: roundedScore,
      previousBest: this.previousBestForMode,
      isNewBest: roundedScore > this.previousBestForMode && roundedScore > 0,
      shardsCollected: this.shardsCollected,
      dronesSmashed: this.dronesSmashed,
      bestCombo: this.bestCombo,
      bestChain: this.bestChain,
      sectorReached: this.sector,
      elapsedSeconds: this.elapsedSeconds,
    });
  }

  public emitHud(): void {
    const p = this.player;
    const progress = clamp(
      (this.score - this.sectorStartScore) / Math.max(1, this.sectorScoreQuota),
      0,
      1
    );
    const overdriveActive = p.overdriveTimer > 0 || (p.latchedAnchorId !== null && p.charge >= 0.85);

    this.callbacks.onHudUpdate({
      score: Math.floor(this.score),
      combo: this.combo,
      comboTimerRatio: clamp(this.comboTimer / COMBO_WINDOW, 0, 1),
      sector: this.sector,
      sectorName: SECTOR_NAMES[(this.sector - 1) % SECTOR_NAMES.length],
      sectorProgress: progress,
      shields: p.shields,
      maxShields: p.maxShields,
      charge: p.charge,
      overdriveActive,
      overdriveRatio: clamp(p.overdriveTimer / OVERDRIVE_DURATION, 0, 1),
      phaseReadyRatio: clamp(1 - p.phaseCooldown / p.phaseMaxCooldown, 0, 1),
      chainCount: p.chainCount,
      mode: this.mode,
      elapsedSeconds: this.elapsedSeconds,
    });
  }

  private render(input: EngineInput): void {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();

    // Clear full canvas with architectural deep slate-navy
    ctx.fillStyle = '#0B1017';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
    }

    ctx.translate(this.offsetX + shakeX, this.offsetY + shakeY);
    ctx.scale(this.scale, this.scale);

    this.drawDraftedArena(ctx);
    this.drawChains(ctx);
    this.drawShockwaves(ctx);

    const p = this.player;
    const isOverdrive = p.overdriveTimer > 0 || (p.latchedAnchorId !== null && p.charge >= 0.85);
    const targetAnchor = p.latchedAnchorId === null ? this.findBestTargetAnchor(input) : null;

    // Subtle target latch preview when free-flying
    if (targetAnchor && this.state === 'PLAYING') {
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 166, 35, 0.24)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(targetAnchor.x, targetAnchor.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Reticle brackets around targetable anchor
      const r = targetAnchor.radius + 14 + Math.sin(this.time * 6) * 2;
      ctx.strokeStyle = 'rgba(245, 166, 35, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(targetAnchor.x, targetAnchor.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Active tether filament + launch trajectory preview
    if (p.latchedAnchorId !== null) {
      const anchor = this.anchors.find((a) => a.id === p.latchedAnchorId);
      if (anchor) {
        this.drawActiveTether(ctx, anchor, p);
      }
    }

    this.drawAnchors(ctx, p.latchedAnchorId, targetAnchor?.id ?? null);
    this.drawShards(ctx);
    this.drawDrones(ctx, isOverdrive);
    this.drawPlayer(ctx, isOverdrive);
    this.drawParticles(ctx);
    this.drawFloatingTexts(ctx);

    ctx.restore();
  }

  private drawDraftedArena(ctx: CanvasRenderingContext2D): void {
    const cx = LOGICAL_WIDTH * 0.5;
    const cy = LOGICAL_HEIGHT * 0.5;

    // Subtle radial depth inside arena
    const bgGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, LOGICAL_WIDTH * 0.62);
    bgGrad.addColorStop(0, '#121B26');
    bgGrad.addColorStop(1, '#0B1017');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(
      ARENA_MARGIN,
      ARENA_MARGIN,
      LOGICAL_WIDTH - ARENA_MARGIN * 2,
      LOGICAL_HEIGHT - ARENA_MARGIN * 2
    );

    // Subtle drafted grid lines
    ctx.strokeStyle = 'rgba(214, 179, 118, 0.045)';
    ctx.lineWidth = 1;
    const gridStep = 80;
    ctx.beginPath();
    for (let x = ARENA_MARGIN + gridStep; x < LOGICAL_WIDTH - ARENA_MARGIN; x += gridStep) {
      ctx.moveTo(x, ARENA_MARGIN);
      ctx.lineTo(x, LOGICAL_HEIGHT - ARENA_MARGIN);
    }
    for (let y = ARENA_MARGIN + gridStep; y < LOGICAL_HEIGHT - ARENA_MARGIN; y += gridStep) {
      ctx.moveTo(ARENA_MARGIN, y);
      ctx.lineTo(LOGICAL_WIDTH - ARENA_MARGIN, y);
    }
    ctx.stroke();

    // Concentric brass compass rings around center
    ctx.strokeStyle = 'rgba(214, 179, 118, 0.08)';
    ctx.lineWidth = 1;
    [140, 260, 380].forEach((radius) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Subtle compass crosshairs
    ctx.strokeStyle = 'rgba(214, 179, 118, 0.07)';
    ctx.beginPath();
    ctx.moveTo(cx - 420, cy);
    ctx.lineTo(cx + 420, cy);
    ctx.moveTo(cx, cy - 300);
    ctx.lineTo(cx, cy + 300);
    ctx.stroke();

    // Arena hairline border with corner architectural ticks
    ctx.strokeStyle = 'rgba(214, 179, 118, 0.24)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      ARENA_MARGIN,
      ARENA_MARGIN,
      LOGICAL_WIDTH - ARENA_MARGIN * 2,
      LOGICAL_HEIGHT - ARENA_MARGIN * 2
    );

    // Corner brass brackets
    const bLen = 18;
    ctx.strokeStyle = '#C89B54';
    ctx.lineWidth = 2;
    const corners = [
      [ARENA_MARGIN, ARENA_MARGIN, 1, 1],
      [LOGICAL_WIDTH - ARENA_MARGIN, ARENA_MARGIN, -1, 1],
      [ARENA_MARGIN, LOGICAL_HEIGHT - ARENA_MARGIN, 1, -1],
      [LOGICAL_WIDTH - ARENA_MARGIN, LOGICAL_HEIGHT - ARENA_MARGIN, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * bLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * bLen, y);
      ctx.stroke();
    }
  }

  private drawChains(ctx: CanvasRenderingContext2D): void {
    for (const c of this.chains) {
      const alpha = (c.life / c.maxLife) * 0.48;
      ctx.save();
      ctx.strokeStyle = `rgba(245, 166, 35, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawActiveTether(ctx: CanvasRenderingContext2D, anchor: Anchor, p: Player): void {
    const isCharged = p.charge >= 0.68;

    // Subtle drafted orbit circle
    ctx.save();
    ctx.strokeStyle = isCharged ? 'rgba(245, 166, 35, 0.24)' : 'rgba(214, 179, 118, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, p.orbitRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Taut luminous tether filament
    const grad = ctx.createLinearGradient(anchor.x, anchor.y, p.x, p.y);
    grad.addColorStop(0, anchor.kind === 'crystal' ? '#2DD4BF' : '#C89B54');
    grad.addColorStop(1, isCharged ? '#FFF3D1' : '#F5A623');

    ctx.strokeStyle = grad;
    ctx.lineWidth = isCharged ? 3.2 : 2.2;
    ctx.shadowColor = isCharged ? '#F5A623' : 'transparent';
    ctx.shadowBlur = isCharged ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Tangential launch trajectory vector
    if (this.settings.showTrajectory && this.state === 'PLAYING') {
      const tangentAngle = p.orbitAngle + (p.orbitDir * Math.PI) / 2;
      const previewLen = 78 + p.charge * 64;
      const tx = p.x + Math.cos(tangentAngle) * previewLen;
      const ty = p.y + Math.sin(tangentAngle) * previewLen;

      ctx.strokeStyle = isCharged ? 'rgba(245, 166, 35, 0.85)' : 'rgba(244, 241, 234, 0.42)';
      ctx.lineWidth = isCharged ? 2 : 1.4;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead
      const headLen = 9;
      ctx.fillStyle = isCharged ? '#F5A623' : 'rgba(244, 241, 234, 0.6)';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(
        tx - Math.cos(tangentAngle - 0.45) * headLen,
        ty - Math.sin(tangentAngle - 0.45) * headLen
      );
      ctx.lineTo(
        tx - Math.cos(tangentAngle + 0.45) * headLen,
        ty - Math.sin(tangentAngle + 0.45) * headLen
      );
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawAnchors(
    ctx: CanvasRenderingContext2D,
    latchedId: number | null,
    targetId: number | null
  ): void {
    for (const a of this.anchors) {
      const isLatched = a.id === latchedId;
      const isTarget = a.id === targetId;

      ctx.save();
      ctx.translate(a.x, a.y);

      const outerR = a.radius + (isLatched ? 6 : isTarget ? 3 : 0);

      if (a.kind === 'accelerator') {
        // Double machined amber accelerator ring
        ctx.strokeStyle = isLatched ? '#FFF3D1' : '#F5A623';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, outerR + 5, a.pulsePhase, a.pulsePhase + Math.PI * 1.4);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(245, 166, 35, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, outerR + 5, a.pulsePhase + Math.PI * 1.55, a.pulsePhase + Math.PI * 1.9);
        ctx.stroke();
      } else if (a.kind === 'crystal') {
        // Faceted mint-jade crystal prongs
        ctx.save();
        ctx.rotate(a.pulsePhase * 0.25);
        ctx.fillStyle = 'rgba(45, 212, 191, 0.25)';
        ctx.strokeStyle = '#2DD4BF';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI * 0.5);
          ctx.beginPath();
          ctx.moveTo(0, -(outerR + 8));
          ctx.lineTo(4, -outerR);
          ctx.lineTo(-4, -outerR);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Main machined brass pivot body
      ctx.fillStyle = '#151E29';
      ctx.beginPath();
      ctx.arc(0, 0, outerR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle =
        a.kind === 'crystal'
          ? '#2DD4BF'
          : isLatched
            ? '#F5A623'
            : '#C89B54';
      ctx.lineWidth = isLatched ? 3 : 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, outerR, 0, Math.PI * 2);
      ctx.stroke();

      // Inner concentric brass ring
      ctx.strokeStyle = 'rgba(214, 179, 118, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, outerR * 0.55, 0, Math.PI * 2);
      ctx.stroke();

      // Center pin
      ctx.fillStyle = isLatched ? '#FFF3D1' : a.kind === 'crystal' ? '#2DD4BF' : '#E8C47C';
      ctx.beginPath();
      ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private drawShards(ctx: CanvasRenderingContext2D): void {
    for (const s of this.shards) {
      const bob = Math.sin(s.age * 4 + s.id) * 1.5;
      ctx.save();
      ctx.translate(s.x, s.y + bob);
      ctx.rotate(s.rotation);

      if (s.kind === 'repair') {
        // Mint-jade shield cross-diamond
        ctx.fillStyle = '#2DD4BF';
        ctx.shadowColor = '#2DD4BF';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(11, 0);
        ctx.lineTo(0, 11);
        ctx.lineTo(-11, 0);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0B1017';
        ctx.fillRect(-5, -1.5, 10, 3);
        ctx.fillRect(-1.5, -5, 3, 10);
      } else {
        // Faceted golden prism lozenge
        ctx.fillStyle = '#F5A623';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(6.5, 0);
        ctx.lineTo(0, 10);
        ctx.lineTo(-6.5, 0);
        ctx.closePath();
        ctx.fill();

        // Warm ivory top facet highlight
        ctx.fillStyle = '#FFF3D1';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(6.5, 0);
        ctx.lineTo(0, -1.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawDrones(ctx: CanvasRenderingContext2D, playerOverdrive: boolean): void {
    for (const d of this.drones) {
      ctx.save();

      // Draw sweeper dotted track subtly so players can read its arc
      if (
        d.kind === 'sweeper' &&
        d.orbitCenterX !== undefined &&
        d.orbitCenterY !== undefined &&
        d.orbitRadius !== undefined
      ) {
        ctx.strokeStyle = 'rgba(239, 83, 80, 0.16)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(d.orbitCenterX, d.orbitCenterY, d.orbitRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.translate(d.x, d.y);

      if (d.spawnWarmup > 0) {
        // Telegraph ring before active
        const progress = 1 - d.spawnWarmup / 0.95;
        ctx.strokeStyle = 'rgba(239, 83, 80, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, d.radius + (1 - progress) * 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.35 + progress * 0.5;
      }

      // Targetable hairline ring when player is in Overdrive
      if (playerOverdrive && d.spawnWarmup <= 0) {
        ctx.strokeStyle = 'rgba(245, 166, 35, 0.72)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, d.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.rotate(d.angle);

      // Crimson drone body
      ctx.fillStyle = '#1C1419';
      ctx.strokeStyle = '#EF5350';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(d.radius + 4, 0);
      ctx.lineTo(-d.radius * 0.55, d.radius * 0.88);
      ctx.lineTo(-d.radius * 0.95, 0);
      ctx.lineTo(-d.radius * 0.55, -d.radius * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner core pip
      ctx.fillStyle = '#EF5350';
      ctx.beginPath();
      ctx.arc(1, 0, 3.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, isOverdrive: boolean): void {
    const p = this.player;

    // Ribbon trail
    if (p.trail.length > 2) {
      for (let i = 1; i < p.trail.length; i++) {
        const prev = p.trail[i - 1];
        const curr = p.trail[i];
        const t = i / p.trail.length;
        ctx.strokeStyle = curr.overdrive
          ? `rgba(245, 166, 35, ${(t * 0.78).toFixed(3)})`
          : `rgba(232, 196, 124, ${(t * 0.36).toFixed(3)})`;
        ctx.lineWidth = (curr.overdrive ? 10 : 5.5) * t;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(p.x, p.y);

    // Invulnerability blink flicker
    if (p.invulnTimer > 0 && Math.floor(this.time * 16) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    // Subtle charge halo while orbiting
    if (p.latchedAnchorId !== null && p.charge > 0.05) {
      ctx.strokeStyle = p.charge >= 0.68 ? '#F5A623' : 'rgba(244, 241, 234, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 7, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * p.charge);
      ctx.stroke();
    } else if (p.phaseCooldown > 0) {
      // Subtle phase recharge arc
      const ready = 1 - p.phaseCooldown / p.phaseMaxCooldown;
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 7, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ready);
      ctx.stroke();
    }

    // Overdrive corona
    if (isOverdrive) {
      ctx.shadowColor = '#F5A623';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = '#FFF3D1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Core kinetic sphere
    const sphereGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, p.radius);
    if (isOverdrive) {
      sphereGrad.addColorStop(0, '#FFFDF7');
      sphereGrad.addColorStop(0.55, '#F5A623');
      sphereGrad.addColorStop(1, '#B4690E');
    } else {
      sphereGrad.addColorStop(0, '#FFF9EB');
      sphereGrad.addColorStop(0.65, '#E2B463');
      sphereGrad.addColorStop(1, '#94672B');
    }

    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.beginPath();
    ctx.arc(-4.2, -4.2, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawShockwaves(ctx: CanvasRenderingContext2D): void {
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = sw.alpha;
      ctx.lineWidth = sw.lineWidth;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const pt of this.particles) {
      ctx.save();
      ctx.globalAlpha = pt.alpha;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (const ft of this.floatingTexts) {
      ctx.globalAlpha = clamp(ft.life / ft.maxLife, 0, 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }
}
