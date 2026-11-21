import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type DeathInfo, type HudSnapshot } from '../game/game';
import { DeathScreen } from './DeathScreen';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { SettingsPanel } from './SettingsPanel';
import { useSettings } from './useSettings';

type Screen = 'menu' | 'playing' | 'dead';

declare global {
  interface Window {
    __massio?: Game;
  }
}

export function App() {
  const { settings, update, ref } = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const sessionRef = useRef<{ mode: string; bots: number } | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [showSettings, setShowSettings] = useState(false);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    const game = new Game(canvasRef.current!, () => ref.current, {
      onHud: setHud,
      onDeath: (d) => {
        setDeath(d);
        setScreen('dead');
      },
      onAction: (a) => {
        if (a !== 'menu') return;
        if (screenRef.current === 'playing') setScreen('menu');
        else if (screenRef.current === 'menu' && game.isAlive) setScreen('playing');
      },
    });
    const s = ref.current;
    game.newSession({ mode: s.mode, botCount: s.botCount });
    sessionRef.current = { mode: s.mode, bots: s.botCount };
    game.start();
    gameRef.current = game;
    window.__massio = game;
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [ref]);

  const play = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const s = ref.current;
    const sess = sessionRef.current;
    // A new world is created when the mode / bot count changed, or the menu backdrop is all that ran.
    if (!sess || sess.mode !== s.mode || sess.bots !== s.botCount || !game.me) {
      game.newSession({ mode: s.mode, botCount: s.botCount });
      sessionRef.current = { mode: s.mode, bots: s.botCount };
    }
    game.spawn({ name: s.nickname.trim(), skin: s.skin, color: s.color });
    setDeath(null);
    setScreen('playing');
    canvasRef.current?.focus();
  }, [ref]);

  const playAgain = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const s = ref.current;
    if (sessionRef.current?.mode !== s.mode) return play();
    game.spawn({ name: s.nickname.trim(), skin: s.skin, color: s.color });
    setDeath(null);
    setScreen('playing');
  }, [play, ref]);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" data-testid="canvas" tabIndex={0} />
      {(screen === 'playing' || screen === 'dead') && <Hud snap={hud} hud={settings.hud} />}
      {screen === 'menu' && !showSettings && (
        <Menu
          settings={settings}
          update={update}
          onPlay={play}
          onSettings={() => setShowSettings(true)}
          canContinue={!!gameRef.current?.isAlive && sessionRef.current?.mode === settings.mode}
          onContinue={() => setScreen('playing')}
        />
      )}
      {screen === 'dead' && death && !showSettings && (
        <DeathScreen info={death} onPlayAgain={playAgain} onMenu={() => setScreen('menu')} />
      )}
      {showSettings && <SettingsPanel settings={settings} update={update} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
