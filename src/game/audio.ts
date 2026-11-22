// Procedural Web Audio API sound synthesizer — zero external audio assets required

const PENTATONIC_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public playLatch(chainCount: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq = 220 * PENTATONIC_RATIOS[Math.min(chainCount, PENTATONIC_RATIOS.length - 1)];

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 0.85, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.065);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playRelease(overdrive: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = overdrive ? 'sawtooth' : 'sine';
    const startFreq = overdrive ? 340 : 280;
    const endFreq = overdrive ? 680 : 440;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(overdrive ? 1900 : 1200, now);

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.13);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(overdrive ? 0.11 : 0.075, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playShard(combo: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const step = (Math.max(1, combo) - 1) % PENTATONIC_RATIOS.length;
    const freq = 392 * PENTATONIC_RATIOS[step];

    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    overtone.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    overtone.frequency.setValueAtTime(freq * 2, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.03, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 0.25);
    overtone.stop(now + 0.13);
  }

  public playSmash(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Punchy bass drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(165, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    subGain.gain.setValueAtTime(0.22, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.23);

    // Metallic chime accent
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(880, now);
    chime.frequency.exponentialRampToValueAtTime(1320, now + 0.09);
    chimeGain.gain.setValueAtTime(0.08, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(now);
    chime.stop(now + 0.17);
  }

  public playPhaseBlink(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playShieldHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.24);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playRepair(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.055;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playSectorUp(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = [293.66, 369.99, 440, 587.33];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.05;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.44);
    });
  }

  public playGameOver(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [329.63, 293.66, 220];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.11;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }
}

export const soundEngine = new SoundEngine();
