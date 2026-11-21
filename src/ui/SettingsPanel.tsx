import { useEffect, useState } from 'react';
import {
  ACTION_LABELS,
  DEFAULT_SETTINGS,
  HUD_LABELS,
  keyLabel,
  type Action,
  type HudSettings,
  type Settings,
} from '../game/settings';

interface Props {
  settings: Settings;
  update: (p: Partial<Settings> | ((s: Settings) => Settings)) => void;
  onClose: () => void;
}

type Tab = 'general' | 'controls' | 'hud';

export function SettingsPanel({ settings, update, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [listening, setListening] = useState<Action | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code;
      update((s) => {
        const keys = { ...s.keys };
        // Swap if the key was already bound to another action.
        for (const a of Object.keys(keys) as Action[]) if (keys[a] === code) keys[a] = s.keys[listening];
        keys[listening] = code;
        return { ...s, keys };
      });
      setListening(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [listening, update]);

  return (
    <div className="overlay" data-testid="settings">
      <div className="panel settings">
        <div className="settings-head">
          <h2>Ajustes</h2>
          <button className="btn small" onClick={onClose} data-testid="close-settings">
            Cerrar
          </button>
        </div>
        <div className="tabs">
          {(['general', 'controls', 'hud'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
              {t === 'general' ? 'General' : t === 'controls' ? 'Controles' : 'HUD y visual'}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div className="tab-body">
            <label className="field">
              <span>Tema</span>
              <select
                data-testid="theme"
                value={settings.theme}
                onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}
              >
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </select>
            </label>
            <label className="field">
              <span>Sensibilidad del cursor: {settings.sensitivity.toFixed(2)}</span>
              <input
                type="range"
                data-testid="sensitivity"
                min={0.3}
                max={2.5}
                step={0.05}
                value={settings.sensitivity}
                onChange={(e) => update({ sensitivity: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Bots por partida: {settings.botCount}</span>
              <input
                type="range"
                data-testid="bots"
                min={0}
                max={80}
                step={1}
                value={settings.botCount}
                onChange={(e) => update({ botCount: Number(e.target.value) })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.animations}
                onChange={(e) => update({ animations: e.target.checked })}
              />
              Animar crecimiento de células
            </label>
            <p className="hint">Los bots y el modo se aplican al empezar una partida nueva.</p>
          </div>
        )}

        {tab === 'controls' && (
          <div className="tab-body">
            {(Object.keys(ACTION_LABELS) as Action[]).map((a) => (
              <div className="keyrow" key={a}>
                <span>{ACTION_LABELS[a]}</span>
                <button className={listening === a ? 'key listening' : 'key'} onClick={() => setListening(a)} data-testid={`bind-${a}`}>
                  {listening === a ? 'Presioná una tecla…' : keyLabel(settings.keys[a])}
                </button>
              </div>
            ))}
            <button className="btn small" onClick={() => update({ keys: { ...DEFAULT_SETTINGS.keys } })}>
              Restaurar controles
            </button>
          </div>
        )}

        {tab === 'hud' && (
          <div className="tab-body grid2">
            {(Object.keys(HUD_LABELS) as (keyof HudSettings)[]).map((k) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  data-testid={`hud-${k}`}
                  checked={settings.hud[k]}
                  onChange={(e) => update((s) => ({ ...s, hud: { ...s.hud, [k]: e.target.checked } }))}
                />
                {HUD_LABELS[k]}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
