import type { DeathInfo } from '../game/game';

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export function DeathScreen({ info, onPlayAgain, onMenu }: { info: DeathInfo; onPlayAgain: () => void; onMenu: () => void }) {
  const s = info.stats;
  const rows: [string, string][] = [
    ['Masa máxima', String(Math.floor(s.peakMass))],
    ['Tiempo vivo', fmtTime(info.timeAlive)],
    ['Pellets comidos', String(s.foodEaten)],
    ['Células comidas', String(s.cellsEaten)],
    ['Virus comidos', String(s.virusesEaten)],
    ['Mejor puesto', s.bestRank ? `#${s.bestRank}` : '—'],
  ];
  return (
    <div className="overlay" data-testid="death">
      <div className="panel death">
        <h2>Fuiste comido</h2>
        {info.killer && <p className="killer">por <strong>{info.killer}</strong></p>}
        <div className="stats-grid">
          {rows.map(([k, v]) => (
            <div key={k} className="stat">
              <div className="stat-value">{v}</div>
              <div className="stat-label">{k}</div>
            </div>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" onClick={onPlayAgain} data-testid="play-again" autoFocus>
            Jugar de nuevo
          </button>
          <button className="btn" onClick={onMenu} data-testid="to-menu">
            Menú
          </button>
        </div>
      </div>
    </div>
  );
}
