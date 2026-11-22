import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameOverModal } from './components/GameOverModal';
import { PauseModal } from './components/PauseModal';
import { TitleScreen } from './components/TitleScreen';
import { TouchControls } from './components/TouchControls';
import { soundEngine } from './game/audio';
import { EngineInput, TetherlineEngine } from './game/engine';
import { gamepadManager } from './game/gamepad';
import { loadHighScores, loadSettings, saveRunScore, saveSettings } from './game/storage';
import {
  ControllerInfo,
  GameMode,
  GameSettings,
  GameState,
  HighScores,
  HudSnapshot,
  InputSource,
  RunSummary,
} from './game/types';

const MODES: GameMode[] = ['standard', 'zen', 'overdrive'];

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  combo: 1,
  comboTimerRatio: 0,
  sector: 1,
  sectorName: 'Calibration',
  sectorProgress: 0,
  shields: 3,
  maxShields: 3,
  charge: 0,
  overdriveActive: false,
  overdriveRatio: 0,
  phaseReadyRatio: 1,
  chainCount: 0,
  mode: 'standard',
  elapsedSeconds: 0,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TetherlineEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [selectedMode, setSelectedMode] = useState<GameMode>('standard');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [highScores, setHighScores] = useState<HighScores>(() => loadHighScores());
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [inputSource, setInputSource] = useState<InputSource>('keyboard_mouse');
  const [controllerInfo, setControllerInfo] = useState<ControllerInfo>(() =>
    gamepadManager.getControllerInfo()
  );

  // Refs synced with latest React state for the RAF game loop
  const gameStateRef = useRef<GameState>(gameState);
  const selectedModeRef = useRef<GameMode>(selectedMode);
  const highScoresRef = useRef<HighScores>(highScores);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    selectedModeRef.current = selectedMode;
  }, [selectedMode]);

  useEffect(() => {
    highScoresRef.current = highScores;
  }, [highScores]);

  // Input state refs (mutated synchronously, zero re-renders per frame)
  const keysRef = useRef<Set<string>>(new Set());
  const pointerLatchRef = useRef(false);
  const touchLatchRef = useRef(false);
  const pointerPosRef = useRef<{ x: number | null; y: number | null; active: boolean }>({
    x: null,
    y: null,
    active: false,
  });
  const queuedPhaseRef = useRef(false);

  // Sync audio & rumble settings on mount and change
  useEffect(() => {
    soundEngine.setMuted(settings.muted);
    gamepadManager.setRumbleEnabled(settings.rumbleEnabled);
    engineRef.current?.updateSettings(settings);
    saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleMute = useCallback(() => {
    soundEngine.unlock();
    setSettings((prev) => ({ ...prev, muted: !prev.muted }));
  }, []);

  const startRun = useCallback((modeOverride?: GameMode) => {
    soundEngine.unlock();
    const modeToRun = modeOverride ?? selectedModeRef.current;
    const prevBest = highScoresRef.current[modeToRun];
    pointerLatchRef.current = false;
    touchLatchRef.current = false;
    queuedPhaseRef.current = false;
    setSummary(null);
    setGameState('PLAYING');
    engineRef.current?.startRun(modeToRun, prevBest);
  }, []);

  const pauseGame = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    pointerLatchRef.current = false;
    touchLatchRef.current = false;
    setGameState('PAUSED');
    engineRef.current?.setState('PAUSED');
  }, []);

  const resumeGame = useCallback(() => {
    if (gameStateRef.current !== 'PAUSED') return;
    soundEngine.unlock();
    setGameState('PLAYING');
    engineRef.current?.setState('PLAYING');
  }, []);

  const returnToMenu = useCallback(() => {
    pointerLatchRef.current = false;
    touchLatchRef.current = false;
    queuedPhaseRef.current = false;
    setSummary(null);
    setGameState('TITLE_MENU');
    engineRef.current?.setState('TITLE_MENU');
  }, []);

  // Initialize Canvas Engine & Main RAF Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new TetherlineEngine(canvas, settings, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onGameOver: (runSummary) => {
        const { updated, previousBest, isNewBest } = saveRunScore(
          runSummary.mode,
          runSummary.score,
          runSummary.bestCombo,
          runSummary.sectorReached
        );
        setHighScores(updated);
        setSummary({
          ...runSummary,
          previousBest,
          isNewBest,
        });
        setGameState('GAME_OVER');
      },
    });

    engineRef.current = engine;

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (resizeObserver && canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const gp = gamepadManager.poll();
      if (gp.anyActivity) {
        setInputSource((prev) => (prev === 'gamepad' ? prev : 'gamepad'));
      }

      const currentState = gameStateRef.current;

      // Controller Menu Navigation & Shortcuts
      if (gp.connected) {
        if (currentState === 'TITLE_MENU') {
          if (gp.menuLeftJustPressed) {
            setSelectedMode((prev) => {
              const idx = MODES.indexOf(prev);
              return MODES[(idx - 1 + MODES.length) % MODES.length];
            });
          } else if (gp.menuRightJustPressed) {
            setSelectedMode((prev) => {
              const idx = MODES.indexOf(prev);
              return MODES[(idx + 1) % MODES.length];
            });
          } else if (gp.confirmJustPressed || gp.pauseJustPressed) {
            startRun();
          }
        } else if (currentState === 'PLAYING') {
          if (gp.pauseJustPressed) {
            pauseGame();
          }
        } else if (currentState === 'PAUSED') {
          if (gp.pauseJustPressed || gp.confirmJustPressed) {
            resumeGame();
          } else if (gp.cancelJustPressed) {
            returnToMenu();
          }
        } else if (currentState === 'GAME_OVER') {
          if (gp.confirmJustPressed) {
            startRun();
          } else if (gp.cancelJustPressed) {
            returnToMenu();
          }
        }
      }

      // Compute merged keyboard + pointer + gamepad input
      const keys = keysRef.current;
      let moveX = 0;
      let moveY = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) moveY -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) moveY += 1;

      if (Math.hypot(gp.moveX, gp.moveY) > 0.15) {
        moveX = gp.moveX;
        moveY = gp.moveY;
      }

      const moveMag = Math.hypot(moveX, moveY);
      if (moveMag > 1) {
        moveX /= moveMag;
        moveY /= moveMag;
      }

      const keyLatch = keys.has('Space') || keys.has('KeyZ') || keys.has('KeyJ');
      const latchHeld = keyLatch || pointerLatchRef.current || touchLatchRef.current || gp.latchHeld;

      const phaseTriggered = queuedPhaseRef.current || gp.phaseJustPressed;
      queuedPhaseRef.current = false;

      const engineInput: EngineInput = {
        moveX,
        moveY,
        pointerX: pointerPosRef.current.x,
        pointerY: pointerPosRef.current.y,
        pointerActive: pointerPosRef.current.active,
        latchHeld,
        phaseTriggered,
      };

      engine.step(dt, engineInput);
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
    // Engine initializes once; settings updates are pushed via updateSettings
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseGame, resumeGame, returnToMenu, startRun]);

  // Gamepad connect/disconnect listeners
  useEffect(() => {
    const syncController = () => {
      const info = gamepadManager.getControllerInfo();
      setControllerInfo(info);
      if (info.connected) {
        setInputSource('gamepad');
      }
    };
    window.addEventListener('gamepadconnected', syncController);
    window.addEventListener('gamepaddisconnected', syncController);
    return () => {
      window.removeEventListener('gamepadconnected', syncController);
      window.removeEventListener('gamepaddisconnected', syncController);
    };
  }, []);

  // Keyboard Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
      ) {
        e.preventDefault();
      }

      soundEngine.unlock();
      setInputSource((prev) => (prev === 'keyboard_mouse' ? prev : 'keyboard_mouse'));

      const state = gameStateRef.current;

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (state === 'PLAYING') {
          pauseGame();
        } else if (state === 'PAUSED') {
          resumeGame();
        }
        return;
      }

      if (state === 'TITLE_MENU') {
        if (e.code === 'Space' || e.code === 'Enter') {
          startRun();
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          setSelectedMode((prev) => {
            const idx = MODES.indexOf(prev);
            return MODES[(idx - 1 + MODES.length) % MODES.length];
          });
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          setSelectedMode((prev) => {
            const idx = MODES.indexOf(prev);
            return MODES[(idx + 1) % MODES.length];
          });
        }
        return;
      }

      if (state === 'GAME_OVER') {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') {
          startRun();
        }
        return;
      }

      if (state === 'PLAYING') {
        if (
          !e.repeat &&
          (e.code === 'ShiftLeft' ||
            e.code === 'ShiftRight' ||
            e.code === 'KeyE' ||
            e.code === 'KeyX' ||
            e.code === 'KeyK')
        ) {
          queuedPhaseRef.current = true;
        }
        keysRef.current.add(e.code);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    const onBlur = () => {
      keysRef.current.clear();
      pointerLatchRef.current = false;
      touchLatchRef.current = false;
      if (gameStateRef.current === 'PLAYING') {
        pauseGame();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [pauseGame, resumeGame, startRun]);

  // Canvas Pointer Handlers
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    soundEngine.unlock();

    if (e.pointerType === 'touch') {
      setInputSource('touch');
    } else {
      setInputSource('keyboard_mouse');
    }

    const pos = engineRef.current?.clientToLogical(e.clientX, e.clientY);
    if (pos) {
      pointerPosRef.current = { x: pos.x, y: pos.y, active: true };
    }

    if (e.button === 2) {
      queuedPhaseRef.current = true;
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    pointerLatchRef.current = true;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    const pos = engineRef.current?.clientToLogical(e.clientX, e.clientY);
    if (pos) {
      pointerPosRef.current = { x: pos.x, y: pos.y, active: true };
    }
  };

  const handleCanvasPointerUp = () => {
    pointerLatchRef.current = false;
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0B1017] text-[#F4F1EA]">
      {/* Active Play HUD */}
      {gameState !== 'TITLE_MENU' && (
        <GameHud
          hud={hud}
          muted={settings.muted}
          inputSource={inputSource}
          controllerInfo={controllerInfo}
          onToggleMute={toggleMute}
          onPause={pauseGame}
        />
      )}

      {/* Main Play Stage */}
      <div className="relative flex-1 w-full min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          className="block w-full h-full touch-none select-none cursor-crosshair"
        />

        {gameState === 'TITLE_MENU' && (
          <TitleScreen
            selectedMode={selectedMode}
            highScores={highScores}
            muted={settings.muted}
            controllerInfo={controllerInfo}
            onSelectMode={setSelectedMode}
            onStart={() => startRun()}
            onToggleMute={toggleMute}
          />
        )}

        {gameState === 'PAUSED' && (
          <PauseModal
            settings={settings}
            controllerConnected={controllerInfo.connected}
            onResume={resumeGame}
            onRestart={() => startRun()}
            onMainMenu={returnToMenu}
            onUpdateSettings={updateSettings}
          />
        )}

        {gameState === 'GAME_OVER' && summary && (
          <GameOverModal
            summary={summary}
            controllerInfo={controllerInfo}
            onPlayAgain={() => startRun()}
            onMainMenu={returnToMenu}
          />
        )}
      </div>

      {/* Adaptive Bottom Control Strip / Mobile Touch Buttons */}
      {gameState !== 'TITLE_MENU' && (
        <TouchControls
          inputSource={inputSource}
          controllerInfo={controllerInfo}
          phaseReady={hud.phaseReadyRatio >= 0.99}
          onLatchStart={() => {
            soundEngine.unlock();
            setInputSource('touch');
            touchLatchRef.current = true;
          }}
          onLatchEnd={() => {
            touchLatchRef.current = false;
          }}
          onPhasePress={() => {
            soundEngine.unlock();
            setInputSource('touch');
            queuedPhaseRef.current = true;
          }}
        />
      )}
    </div>
  );
}
