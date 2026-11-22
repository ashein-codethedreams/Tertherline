import { useState } from 'react';
import { Gamepad2, Play, Volume2, VolumeX } from 'lucide-react';
import { getGamepadPrompts } from '../game/gamepad';
import { ControllerInfo, GameMode, HighScores, MODE_META } from '../game/types';

const KEY_ART_SRC = '/src/assets/images/tetherline_key_art_1795389405770.jpg';

interface TitleScreenProps {
  selectedMode: GameMode;
  highScores: HighScores;
  muted: boolean;
  controllerInfo: ControllerInfo;
  onSelectMode: (mode: GameMode) => void;
  onStart: () => void;
  onToggleMute: () => void;
}

const MODES: GameMode[] = ['standard', 'zen', 'overdrive'];

export function TitleScreen({
  selectedMode,
  highScores,
  muted,
  controllerInfo,
  onSelectMode,
  onStart,
  onToggleMute,
}: TitleScreenProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const modeInfo = MODE_META[selectedMode];
  const modeBest = highScores[selectedMode];
  const gp = getGamepadPrompts(controllerInfo.family);

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between bg-[#0B1017]/78 backdrop-blur-[3px] overflow-y-auto">
      {/* Minimal Top Bar */}
      <header className="w-full max-w-[1200px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between gap-8 shrink-0">
        <span className="font-display text-lg font-bold tracking-tight text-[#F4F1EA] whitespace-nowrap shrink-0">
          Tetherline
        </span>

        <div className="hidden sm:flex items-center gap-3 text-xs text-[#94A3B8] whitespace-nowrap">
          <span>Free to play</span>
          <span aria-hidden="true">·</span>
          <span>Instant browser launch</span>
          <span aria-hidden="true">·</span>
          <span>
            {controllerInfo.connected ? `${controllerInfo.name} ready` : 'Keyboard, mouse, touch & controller'}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          className="h-10 px-3.5 flex items-center gap-2 rounded-md border border-[#D6B376]/20 bg-[#141D28]/90 text-xs font-medium text-[#CBD5E1] hover:text-[#F4F1EA] hover:border-[#D6B376]/45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          <span>{muted ? 'Sound Off' : 'Sound On'}</span>
        </button>
      </header>

      {/* Main Centered Editorial Split */}
      <main className="w-full max-w-[1200px] mx-auto px-6 sm:px-10 py-6 sm:py-10 my-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          {/* Left Column: Title, Mode Selector, Primary CTA, Controls */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-7">
            <div className="space-y-4">
              <p className="text-xs font-medium tracking-wide text-[#D6B376]">
                Orbital Slingshot Arcade
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-[#F4F1EA] leading-[1.06] text-balance">
                Swing on the tether. Release into Overdrive.
              </h1>
              <p className="text-base text-[#CBD5E1] leading-relaxed max-w-xl">
                Hold a single button to latch onto brass pivot anchors, whip through golden prism arcs,
                and slingshot at high velocity to shatter incoming sentinel drones.
              </p>
            </div>

            {/* Interactive Mode Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span>Select Mode</span>
                <span className="font-mono-tabular text-[#D6B376]">
                  Best: {modeBest.toLocaleString()}
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label="Game mode"
                className="grid grid-cols-3 gap-1.5 p-1.5 rounded-lg bg-[#121A24] border border-[#D6B376]/15"
              >
                {MODES.map((m) => {
                  const active = selectedMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onSelectMode(m)}
                      className={`h-11 px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-[#F5A623] text-[#0B1017] font-semibold'
                          : 'text-[#CBD5E1] hover:text-[#F4F1EA] hover:bg-[#1A2534]'
                      }`}
                    >
                      {MODE_META[m].label}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-[#94A3B8]">{modeInfo.shortDesc}</p>
            </div>

            {/* Primary CTA */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={onStart}
                className="h-12 px-7 rounded-md bg-[#F5A623] hover:bg-[#F7B547] active:translate-y-[1px] text-[#0B1017] font-semibold text-sm flex items-center gap-2.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Game</span>
              </button>

              <span className="text-xs text-[#94A3B8] whitespace-nowrap">
                {controllerInfo.connected
                  ? `Press ${gp.confirm} on controller or Space to begin`
                  : 'Press Space or click to begin'}
              </span>
            </div>
          </div>

          {/* Right Column: Bespoke Key Art + Controls Breakdown */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            <div className="relative flex-1 min-h-[220px] sm:min-h-[260px] rounded-xl overflow-hidden border border-[#D6B376]/20 bg-[#121A24]">
              {!imgFailed ? (
                <img
                  src={KEY_ART_SRC}
                  alt="Brass orbital pivot anchor with golden kinetic sphere and prism shard trail"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#16212E] to-[#0B1017] text-center">
                  <div className="w-16 h-16 rounded-full border-2 border-[#C89B54] flex items-center justify-center mb-3">
                    <div className="w-4 h-4 rounded-full bg-[#F5A623]" />
                  </div>
                  <p className="font-display text-lg font-semibold text-[#F4F1EA]">Tetherline</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Orbital Slingshot Arena</p>
                </div>
              )}

              {/* Measured bottom contrast scrim for crisp personal best overlay */}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 bg-gradient-to-t from-[#0B1017]/95 via-[#0B1017]/65 to-transparent">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 text-[#CBD5E1]">
                    <span>
                      Best Combo{' '}
                      <strong className="font-mono-tabular text-[#F4F1EA]">
                        ×{highScores.bestCombo}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Highest Sector{' '}
                      <strong className="font-mono-tabular text-[#F4F1EA]">
                        {highScores.bestSector}
                      </strong>
                    </span>
                  </div>
                  {controllerInfo.connected && (
                    <div className="flex items-center gap-1.5 text-[#2DD4BF]">
                      <Gamepad2 className="w-3.5 h-3.5" />
                      <span>{controllerInfo.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Clean 3-column How to Play strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 border-t border-[#D6B376]/15">
              <div className="pt-3">
                <p className="text-xs font-semibold text-[#F4F1EA]">01. Latch &amp; Swing</p>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Hold{' '}
                  <span className="text-[#F5A623] font-medium">
                    {controllerInfo.connected ? gp.latch : 'Space / Click'}
                  </span>{' '}
                  near a brass anchor to orbit and build charge.
                </p>
              </div>
              <div className="pt-3">
                <p className="text-xs font-semibold text-[#F4F1EA]">02. Slingshot Smash</p>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Release at high charge to enter Overdrive and shatter red drones on impact.
                </p>
              </div>
              <div className="pt-3">
                <p className="text-xs font-semibold text-[#F4F1EA]">03. Phase Flip</p>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Tap{' '}
                  <span className="text-[#2DD4BF] font-medium">
                    {controllerInfo.connected ? gp.phase : 'Shift / Right-Click'}
                  </span>{' '}
                  to reverse orbit or blink through danger.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="w-full max-w-[1200px] mx-auto px-6 sm:px-10 py-4 border-t border-[#D6B376]/10 flex flex-wrap items-center justify-between gap-4 text-xs text-[#64748B] shrink-0">
        <span>Steer with WASD, Arrow Keys, or Left Stick · Escape or Start to Pause</span>
        <span>All progress saved locally in your browser</span>
      </footer>
    </div>
  );
}
