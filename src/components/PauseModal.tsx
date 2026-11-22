import { Play, RotateCcw, Home } from 'lucide-react';
import { GameSettings } from '../game/types';

interface PauseModalProps {
  settings: GameSettings;
  controllerConnected: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
}

export function PauseModal({
  settings,
  controllerConnected,
  onResume,
  onRestart,
  onMainMenu,
  onUpdateSettings,
}: PauseModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-[#0B1017]/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl bg-[#131C27] border border-[#D6B376]/20 p-6 sm:p-7 space-y-6">
        <div className="space-y-1">
          <h2 id="pause-title" className="font-display text-2xl font-bold text-[#F4F1EA]">
            Game Paused
          </h2>
          <p className="text-sm text-[#94A3B8]">
            Adjust play preferences or jump straight back into the arena.
          </p>
        </div>

        {/* Settings Toggles */}
        <div className="space-y-3 border-y border-[#D6B376]/12 py-4">
          <ToggleRow
            label="Sound Effects"
            description="Synthesized chimes and kinetic feedback"
            checked={!settings.muted}
            onChange={(checked) => onUpdateSettings({ muted: !checked })}
          />
          <ToggleRow
            label="Launch Trajectory Guide"
            description="Show dotted tangent preview while orbiting"
            checked={settings.showTrajectory}
            onChange={(checked) => onUpdateSettings({ showTrajectory: checked })}
          />
          <ToggleRow
            label="Reduced Motion"
            description="Disable screen shake and hit-stop freeze"
            checked={settings.reducedMotion}
            onChange={(checked) => onUpdateSettings({ reducedMotion: checked })}
          />
          {controllerConnected && (
            <ToggleRow
              label="Controller Vibration"
              description="Haptic rumble on latch, overdrive, and impact"
              checked={settings.rumbleEnabled}
              onChange={(checked) => onUpdateSettings({ rumbleEnabled: checked })}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="h-11 w-full rounded-md bg-[#F5A623] hover:bg-[#F7B547] text-[#0B1017] font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Resume</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onRestart}
              className="h-11 rounded-md border border-[#D6B376]/20 bg-[#182331] hover:border-[#D6B376]/45 text-[#F4F1EA] text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restart</span>
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="h-11 rounded-md border border-[#D6B376]/20 bg-[#182331] hover:border-[#D6B376]/45 text-[#CBD5E1] hover:text-[#F4F1EA] text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Main Menu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[#F4F1EA]">{label}</p>
        <p className="text-xs text-[#94A3B8]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
          checked ? 'bg-[#F5A623]' : 'bg-[#263445]'
        }`}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-[#0B1017] transition-transform duration-150 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
