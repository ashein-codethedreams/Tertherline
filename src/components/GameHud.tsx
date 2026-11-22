import { Pause, Volume2, VolumeX } from 'lucide-react';
import { getGamepadPrompts } from '../game/gamepad';
import { ControllerInfo, HudSnapshot, InputSource } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  inputSource: InputSource;
  controllerInfo: ControllerInfo;
  onToggleMute: () => void;
  onPause: () => void;
}

export function GameHud({
  hud,
  muted,
  inputSource,
  controllerInfo,
  onToggleMute,
  onPause,
}: GameHudProps) {
  const gp = getGamepadPrompts(controllerInfo.family);
  const overdrivePct = Math.round(
    (hud.overdriveActive ? Math.max(hud.overdriveRatio, hud.charge) : hud.charge) * 100
  );
  const phaseReady = hud.phaseReadyRatio >= 0.99;

  return (
    <header className="w-full h-14 px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-[#D6B376]/15 bg-[#0E141D]/92 backdrop-blur-sm select-none shrink-0 z-20">
      {/* Left: Score & Multiplier */}
      <div className="flex items-baseline gap-4 min-w-0">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-[#94A3B8] leading-none">Score</span>
          <span className="font-mono-tabular text-xl sm:text-2xl font-bold text-[#F4F1EA] leading-tight tracking-tight">
            {hud.score.toLocaleString()}
          </span>
        </div>

        <div className="hidden sm:flex flex-col min-w-[76px]">
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="text-[#94A3B8]">Combo</span>
            <span
              className={`font-mono-tabular font-semibold ${
                hud.combo > 1 ? 'text-[#F5A623]' : 'text-[#94A3B8]'
              }`}
            >
              ×{hud.combo}
            </span>
          </div>
          <div className="w-16 h-1 bg-[#1E293B] mt-1.5 overflow-hidden">
            <div
              className="h-full bg-[#F5A623] transition-transform duration-100 origin-left"
              style={{ transform: `scaleX(${hud.combo > 1 ? hud.comboTimerRatio : 0})` }}
            />
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-[#94A3B8] border-l border-[#D6B376]/15 pl-4 whitespace-nowrap">
          <span className="text-[#F4F1EA] font-medium">Sector {hud.sector}</span>
          <span aria-hidden="true">·</span>
          <span>{hud.sectorName}</span>
          {hud.chainCount >= 2 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-[#F5A623]">Chain ×{hud.chainCount}</span>
            </>
          )}
        </div>
      </div>

      {/* Center: Shields & Kinetic Meters */}
      <div className="flex items-center gap-5 sm:gap-7">
        {/* Shields (non-hue-only: visual blocks + explicit numeric count) */}
        {hud.mode !== 'zen' ? (
          <div className="flex items-center gap-2.5" aria-label={`Shields ${hud.shields} of ${hud.maxShields}`}>
            <span className="hidden sm:inline text-xs text-[#94A3B8]">Shields</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: hud.maxShields }).map((_, idx) => (
                <span
                  key={idx}
                  className={`block w-3.5 h-2 transition-colors duration-150 ${
                    idx < hud.shields ? 'bg-[#2DD4BF]' : 'bg-[#1E293B] border border-[#334155]'
                  }`}
                />
              ))}
            </div>
            <span className="font-mono-tabular text-xs font-medium text-[#F4F1EA]">
              {hud.shields}/{hud.maxShields}
            </span>
          </div>
        ) : (
          <div className="text-xs text-[#2DD4BF] whitespace-nowrap">Zen Drift</div>
        )}

        {/* Overdrive Meter */}
        <div className="hidden lg:flex items-center gap-2.5">
          <span className="text-xs text-[#94A3B8] whitespace-nowrap">
            {hud.overdriveActive ? 'Overdrive' : 'Charge'}
          </span>
          <div className="w-24 h-1.5 bg-[#1E293B] overflow-hidden">
            <div
              className={`h-full origin-left transition-transform duration-75 ${
                hud.overdriveActive ? 'bg-[#F5A623]' : 'bg-[#D6B376]'
              }`}
              style={{ transform: `scaleX(${Math.min(1, overdrivePct / 100)})` }}
            />
          </div>
          <span
            className={`font-mono-tabular text-xs w-9 text-right ${
              hud.overdriveActive ? 'text-[#F5A623] font-semibold' : 'text-[#94A3B8]'
            }`}
          >
            {overdrivePct}%
          </span>
        </div>

        {/* Phase Indicator */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-[#94A3B8]">Phase</span>
          <span
            className={`font-mono-tabular text-xs font-medium whitespace-nowrap ${
              phaseReady ? 'text-[#2DD4BF]' : 'text-[#64748B]'
            }`}
          >
            {phaseReady ? 'Ready' : `${Math.round(hud.phaseReadyRatio * 100)}%`}
          </span>
        </div>
      </div>

      {/* Right: Utility Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {inputSource === 'gamepad' && controllerInfo.connected && (
          <span className="hidden xl:inline text-xs text-[#94A3B8] mr-2 whitespace-nowrap">
            {gp.pause} to Pause
          </span>
        )}
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="h-10 w-10 flex items-center justify-center rounded-md border border-[#D6B376]/15 bg-[#141D28] text-[#CBD5E1] hover:text-[#F4F1EA] hover:border-[#D6B376]/40 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onPause}
          aria-label="Pause game"
          className="h-10 px-3.5 flex items-center gap-2 rounded-md border border-[#D6B376]/20 bg-[#141D28] text-xs font-medium text-[#F4F1EA] hover:border-[#F5A623]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Pause className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pause</span>
        </button>
      </div>
    </header>
  );
}
