import type { HudSnapshot } from '../game/game';
import type { HudSettings } from '../game/settings';

export function Hud({ snap, hud }: { snap: HudSnapshot | null; hud: HudSettings }) {
  if (!snap) return null;
  return (
    <div className="hud" data-testid="hud">
      {(hud.fps || hud.ping) && (
        <div className="hud-box perf" data-testid="perf">
          {hud.fps && <span data-testid="fps">FPS: {snap.fps}</span>}
          {hud.ping && <span data-testid="ping">Ping: {snap.ping.toFixed(1)} ms</span>}
        </div>
      )}
      {hud.leaderboard && (
        <div className="hud-box leaderboard" data-testid="leaderboard">
          <h3>Leaderboard</h3>
          <ol>
            {snap.leaderboard.map((e, i) => (
              <li key={e.id} className={e.id === snap.myId ? 'me' : undefined}>
                {i + 1}. {e.name || 'Sin nombre'}
              </li>
            ))}
          </ol>
          {snap.alive && snap.rank > 10 && <div className="me">{snap.rank}. Vos</div>}
        </div>
      )}
      {snap.alive && hud.mass && (
        <div className="hud-box score" data-testid="score">
          Puntuación: {snap.mass}
        </div>
      )}
      {snap.alive && hud.stats && (
        <div className="hud-box stats" data-testid="live-stats">
          Células: {snap.cells}/16 · Puesto: {snap.rank} · Jugadores: {snap.players}
        </div>
      )}
    </div>
  );
}
