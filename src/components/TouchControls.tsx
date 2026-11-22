import { getGamepadPrompts } from '../game/gamepad';
import { ControllerInfo, InputSource } from '../game/types';

interface TouchControlsProps {
  inputSource: InputSource;
  controllerInfo: ControllerInfo;
  phaseReady: boolean;
  onLatchStart: () => void;
  onLatchEnd: () => void;
  onPhasePress: () => void;
}

export function TouchControls({
  inputSource,
  controllerInfo,
  phaseReady,
  onLatchStart,
  onLatchEnd,
  onPhasePress,
}: TouchControlsProps) {
  const gp = getGamepadPrompts(controllerInfo.family);

  return (
    <>
      {/* Subtle unboxed bottom hint bar on desktop (never crowds the arena) */}
      <div className="hidden md:flex items-center justify-center gap-4 px-4 h-8 bg-[#0B1017]/90 border-t border-[#D6B376]/10 text-[11px] text-[#94A3B8] select-none shrink-0">
        {inputSource === 'gamepad' && controllerInfo.connected ? (
          <>
            <span>
              <strong className="text-[#F4F1EA] font-medium">{gp.latch}</strong> Hold to Latch
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#F4F1EA] font-medium">{gp.phase}</strong> Phase Flip / Blink
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#F4F1EA] font-medium">Left Stick</strong> Steer
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#2DD4BF] font-medium">{controllerInfo.name}</strong>
            </span>
          </>
        ) : (
          <>
            <span>
              <strong className="text-[#F4F1EA] font-medium">Space / Left-Click</strong> Hold to Latch &amp; Swing
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#F4F1EA] font-medium">Shift / Right-Click</strong> Phase Flip or Blink
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#F4F1EA] font-medium">WASD / Arrows</strong> Steer
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[#F4F1EA] font-medium">Esc</strong> Pause
            </span>
          </>
        )}
      </div>

      {/* Dedicated large touch buttons on mobile / touch screens (compact bottom bar <= 15% height) */}
      <div className="flex md:hidden items-center justify-between gap-3 px-4 py-2.5 bg-[#0E141D]/95 border-t border-[#D6B376]/15 select-none shrink-0">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onPhasePress();
          }}
          className={`h-12 flex-1 rounded-lg border text-sm font-semibold transition-colors whitespace-nowrap touch-none ${
            phaseReady
              ? 'border-[#2DD4BF]/50 bg-[#13292C] text-[#2DD4BF] active:bg-[#2DD4BF] active:text-[#0B1017]'
              : 'border-[#334155] bg-[#141D28] text-[#64748B]'
          }`}
        >
          Phase Flip
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onLatchStart();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            onLatchEnd();
          }}
          onPointerCancel={onLatchEnd}
          onPointerLeave={onLatchEnd}
          className="h-12 flex-[1.5] rounded-lg bg-[#F5A623] active:bg-[#F7B547] text-[#0B1017] text-sm font-bold whitespace-nowrap touch-none"
        >
          Hold to Latch
        </button>
      </div>
    </>
  );
}
