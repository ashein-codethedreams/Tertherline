import { ControllerInfo, GamepadFamily, GamepadInputState } from './types';

function detectFamily(id: string): GamepadFamily {
  const lower = id.toLowerCase();
  if (lower.includes('dualsense') || lower.includes('dualshock') || lower.includes('playstation') || lower.includes('054c')) {
    return 'playstation';
  }
  if (lower.includes('nintendo') || lower.includes('pro controller') || lower.includes('joy-con') || lower.includes('057e')) {
    return 'switch';
  }
  if (lower.includes('xbox') || lower.includes('xinput') || lower.includes('microsoft') || lower.includes('045e')) {
    return 'xbox';
  }
  return 'standard';
}

function cleanControllerName(id: string, family: GamepadFamily): string {
  if (family === 'playstation') return 'PlayStation Controller';
  if (family === 'xbox') return 'Xbox Controller';
  if (family === 'switch') return 'Switch Controller';
  const trimmed = id.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return trimmed.length > 26 ? `${trimmed.slice(0, 26)}…` : trimmed || 'Game Controller';
}

export function getGamepadPrompts(family: GamepadFamily): {
  latch: string;
  phase: string;
  pause: string;
  confirm: string;
} {
  if (family === 'playstation') {
    return { latch: '× / R2', phase: '○ / L2', pause: 'Options', confirm: '×' };
  }
  if (family === 'switch') {
    return { latch: 'B / ZR', phase: 'A / ZL', pause: '+', confirm: 'B' };
  }
  return { latch: 'A / RT', phase: 'B / LT', pause: 'Start', confirm: 'A' };
}

class GamepadManager {
  private prevLatch = false;
  private prevPhase = false;
  private prevPause = false;
  private prevLeft = false;
  private prevRight = false;
  private prevConfirm = false;
  private prevCancel = false;
  private rumbleEnabled = true;

  public setRumbleEnabled(enabled: boolean): void {
    this.rumbleEnabled = enabled;
  }

  public getActiveGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  public getControllerInfo(): ControllerInfo {
    const pad = this.getActiveGamepad();
    if (!pad) {
      return { connected: false, name: '', family: 'standard' };
    }
    const family = detectFamily(pad.id);
    return {
      connected: true,
      name: cleanControllerName(pad.id, family),
      family,
    };
  }

  public poll(): GamepadInputState {
    const pad = this.getActiveGamepad();
    if (!pad) {
      this.prevLatch = false;
      this.prevPhase = false;
      this.prevPause = false;
      this.prevLeft = false;
      this.prevRight = false;
      this.prevConfirm = false;
      this.prevCancel = false;
      return {
        connected: false,
        moveX: 0,
        moveY: 0,
        latchHeld: false,
        latchJustPressed: false,
        phaseJustPressed: false,
        pauseJustPressed: false,
        menuLeftJustPressed: false,
        menuRightJustPressed: false,
        confirmJustPressed: false,
        cancelJustPressed: false,
        anyActivity: false,
      };
    }

    const rawX = pad.axes[0] ?? 0;
    const rawY = pad.axes[1] ?? 0;
    const mag = Math.hypot(rawX, rawY);
    const deadzone = 0.18;

    let moveX = 0;
    let moveY = 0;
    if (mag > deadzone) {
      const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
      moveX = (rawX / mag) * scaled;
      moveY = (rawY / mag) * scaled;
    }

    const dpadUp = pad.buttons[12]?.pressed ?? false;
    const dpadDown = pad.buttons[13]?.pressed ?? false;
    const dpadLeft = pad.buttons[14]?.pressed ?? false;
    const dpadRight = pad.buttons[15]?.pressed ?? false;

    if (dpadLeft) moveX = -1;
    if (dpadRight) moveX = 1;
    if (dpadUp) moveY = -1;
    if (dpadDown) moveY = 1;

    const btnA = pad.buttons[0]?.pressed ?? false;
    const btnB = pad.buttons[1]?.pressed ?? false;
    const btnX = pad.buttons[2]?.pressed ?? false;
    const btnLB = pad.buttons[4]?.pressed ?? false;
    const btnRB = pad.buttons[5]?.pressed ?? false;
    const triggerLT = (pad.buttons[6]?.value ?? 0) > 0.35 || (pad.buttons[6]?.pressed ?? false);
    const triggerRT = (pad.buttons[7]?.value ?? 0) > 0.35 || (pad.buttons[7]?.pressed ?? false);
    const btnStart = pad.buttons[9]?.pressed ?? false;

    const latchHeld = btnA || triggerRT || btnRB;
    const phaseHeld = btnB || btnX || triggerLT || btnLB;
    const navLeft = dpadLeft || rawX < -0.55;
    const navRight = dpadRight || rawX > 0.55;

    const state: GamepadInputState = {
      connected: true,
      moveX,
      moveY,
      latchHeld,
      latchJustPressed: latchHeld && !this.prevLatch,
      phaseJustPressed: phaseHeld && !this.prevPhase,
      pauseJustPressed: btnStart && !this.prevPause,
      menuLeftJustPressed: navLeft && !this.prevLeft,
      menuRightJustPressed: navRight && !this.prevRight,
      confirmJustPressed: btnA && !this.prevConfirm,
      cancelJustPressed: btnB && !this.prevCancel,
      anyActivity:
        Math.abs(moveX) > 0.2 ||
        Math.abs(moveY) > 0.2 ||
        latchHeld ||
        phaseHeld ||
        btnStart ||
        dpadLeft ||
        dpadRight ||
        dpadUp ||
        dpadDown,
    };

    this.prevLatch = latchHeld;
    this.prevPhase = phaseHeld;
    this.prevPause = btnStart;
    this.prevLeft = navLeft;
    this.prevRight = navRight;
    this.prevConfirm = btnA;
    this.prevCancel = btnB;

    return state;
  }

  public rumble(durationMs: number, weakMagnitude: number, strongMagnitude: number): void {
    if (!this.rumbleEnabled) return;
    const pad = this.getActiveGamepad();
    if (!pad) return;
    const actuator = (
      pad as Gamepad & {
        vibrationActuator?: {
          playEffect?: (
            type: string,
            params: {
              startDelay: number;
              duration: number;
              weakMagnitude: number;
              strongMagnitude: number;
            }
          ) => Promise<void>;
        };
      }
    ).vibrationActuator;

    if (actuator && typeof actuator.playEffect === 'function') {
      actuator
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: Math.min(1, Math.max(0, weakMagnitude)),
          strongMagnitude: Math.min(1, Math.max(0, strongMagnitude)),
        })
        .catch(() => {});
    }
  }
}

export const gamepadManager = new GamepadManager();
