import { Home, RotateCcw } from 'lucide-react';
import { getGamepadPrompts } from '../game/gamepad';
import { ControllerInfo, MODE_META, RunSummary } from '../game/types';

interface GameOverModalProps {
  summary: RunSummary;
  controllerInfo: ControllerInfo;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function GameOverModal({
  summary,
  controllerInfo,
  onPlayAgain,
  onMainMenu,
}: GameOverModalProps) {
  const gp = getGamepadPrompts(controllerInfo.family);
  const bestToShow = Math.max(summary.score, summary.previousBest);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
      className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-[#0B1017]/82 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#131C27] border border-[#D6B376]/22 p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <span>{MODE_META[summary.mode].label} Mode</span>
            <span aria-hidden="true">·</span>
            <span>Sector {summary.sectorReached}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{formatDuration(summary.elapsedSeconds)}</span>
          </div>
          <h2 id="gameover-title" className="font-display text-3xl font-bold text-[#F4F1EA]">
            Run Complete
          </h2>
        </div>

        {/* Final Score Block */}
        <div className="flex items-end justify-between gap-4 border-y border-[#D6B376]/15 py-5">
          <div>
            <p className="text-xs text-[#94A3B8]">Final Score</p>
            <p className="font-mono-tabular text-4xl font-bold text-[#F4F1EA] mt-1">
              {summary.score.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#94A3B8]">
              {summary.isNewBest ? (
                <span className="text-[#F5A623] font-semibold">New Personal Best</span>
              ) : (
                'Personal Best'
              )}
            </p>
            <p className="font-mono-tabular text-xl font-semibold text-[#D6B376] mt-1">
              {bestToShow.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Run Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[#94A3B8]">Shards</p>
            <p className="font-mono-tabular text-lg font-semibold text-[#F4F1EA] mt-0.5">
              {summary.shardsCollected}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Smashed</p>
            <p className="font-mono-tabular text-lg font-semibold text-[#F4F1EA] mt-0.5">
              {summary.dronesSmashed}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Best Combo</p>
            <p className="font-mono-tabular text-lg font-semibold text-[#F5A623] mt-0.5">
              ×{summary.bestCombo}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Best Chain</p>
            <p className="font-mono-tabular text-lg font-semibold text-[#2DD4BF] mt-0.5">
              ×{Math.max(1, summary.bestChain)}
            </p>
          </div>
        </div>

        {/* Primary Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onPlayAgain}
            className="h-12 flex-1 px-5 rounded-md bg-[#F5A623] hover:bg-[#F7B547] text-[#0B1017] font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Again</span>
          </button>

          <button
            type="button"
            onClick={onMainMenu}
            className="h-12 px-5 rounded-md border border-[#D6B376]/20 bg-[#182331] hover:border-[#D6B376]/45 text-[#F4F1EA] text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
        </div>

        <p className="text-xs text-[#64748B] text-center">
          {controllerInfo.connected
            ? `Press ${gp.confirm} to play again or ${gp.phase.split(' ')[0]} for menu`
            : 'Press Space or R to play again'}
        </p>
      </div>
    </div>
  );
}
