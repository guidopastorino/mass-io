import { useMemo } from 'react';
import type { GameMode } from '../engine/constants';
import { CELL_COLORS } from '../engine/names';
import { SKINS, SKIN_LABELS, type SkinId } from '../engine/skins';
import type { Settings } from '../game/settings';
import { getSkinDataUrl } from '../render/skins';

interface Props {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onPlay: () => void;
  onSettings: () => void;
  canContinue: boolean;
  onContinue: () => void;
}

const MODES: { id: GameMode; label: string; desc: string }[] = [
  { id: 'ffa', label: 'FFA', desc: 'Todos contra todos. Alimentá virus para dispararlos.' },
  { id: 'experimental', label: 'Experimental', desc: 'Spawners que reparten masa y virus que se desplazan.' },
  { id: 'bots', label: 'Bots', desc: 'Controlás bots que siguen tu mouse. Las células se unen más rápido.' },
];

export function Menu({ settings, update, onPlay, onSettings, canContinue, onContinue }: Props) {
  const skinUrls = useMemo(() => Object.fromEntries(SKINS.map((s) => [s, getSkinDataUrl(s)])) as Record<SkinId, string>, []);
  return (
    <div className="overlay" data-testid="menu">
      <div className="panel menu">
        <h1 className="logo">
          Mass<span>.io</span>
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onPlay();
          }}
        >
          <input
            className="nick"
            data-testid="nickname"
            placeholder="Nickname"
            maxLength={15}
            value={settings.nickname}
            onChange={(e) => update({ nickname: e.target.value })}
            autoFocus
          />
          <div className="modes" role="radiogroup" aria-label="Modo de juego">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.id}
                role="radio"
                aria-checked={settings.mode === m.id}
                data-testid={`mode-${m.id}`}
                className={settings.mode === m.id ? 'mode active' : 'mode'}
                onClick={() => update({ mode: m.id })}
                title={m.desc}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="hint">{MODES.find((m) => m.id === settings.mode)!.desc}</p>

          <div className="section-label">Skin</div>
          <div className="skins">
            <button
              type="button"
              className={settings.skin === null ? 'skin active' : 'skin'}
              style={{ background: settings.color }}
              onClick={() => update({ skin: null })}
              data-testid="skin-none"
              aria-label="Sin skin"
            />
            {SKINS.map((s) => (
              <button
                type="button"
                key={s}
                className={settings.skin === s ? 'skin active' : 'skin'}
                style={{ backgroundImage: `url(${skinUrls[s]})` }}
                onClick={() => update({ skin: s })}
                data-testid={`skin-${s}`}
                title={SKIN_LABELS[s]}
                aria-label={SKIN_LABELS[s]}
              />
            ))}
          </div>
          {settings.mode === 'bots' && (
            <div className="minion-setup" data-testid="minion-setup">
              <div className="section-label">Tus bots</div>
              <input
                className="nick small"
                data-testid="minion-name"
                placeholder="Nombre de tus bots"
                maxLength={15}
                value={settings.minionName}
                onChange={(e) => update({ minionName: e.target.value })}
              />
              <div className="skins">
                <button
                  type="button"
                  className={settings.minionSkin === null ? 'skin active' : 'skin'}
                  style={{ background: settings.color }}
                  onClick={() => update({ minionSkin: null })}
                  data-testid="minion-skin-none"
                  aria-label="Bots sin skin"
                />
                {SKINS.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={settings.minionSkin === s ? 'skin active' : 'skin'}
                    style={{ backgroundImage: `url(${skinUrls[s]})` }}
                    onClick={() => update({ minionSkin: s })}
                    data-testid={`minion-skin-${s}`}
                    title={`Bots: ${SKIN_LABELS[s]}`}
                    aria-label={`Bots: ${SKIN_LABELS[s]}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="colors">
            {CELL_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={settings.color === c ? 'swatch active' : 'swatch'}
                style={{ background: c }}
                onClick={() => update({ color: c, skin: null })}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>

          <div className="row">
            {canContinue ? (
              <button type="button" className="btn primary" onClick={onContinue} data-testid="continue">
                Continuar
              </button>
            ) : (
              <button type="submit" className="btn primary" data-testid="play">
                Jugar
              </button>
            )}
            <button type="button" className="btn" onClick={onSettings} data-testid="open-settings">
              Ajustes
            </button>
          </div>
        </form>
        <p className="controls-hint">
          Mouse: mover · Espacio: dividir · W: expulsar masa · Rueda: zoom
          {settings.mode === 'bots' && <> · E / R / Y: dividir bots (x2 / x4 / x16)</>}
        </p>
      </div>
    </div>
  );
}
