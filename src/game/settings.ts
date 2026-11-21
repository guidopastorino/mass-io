import type { GameMode } from '../engine/constants';
import { SKINS, type SkinId } from '../engine/skins';

export type Theme = 'light' | 'dark';
export type Action = 'split' | 'eject' | 'doubleSplit' | 'maxSplit' | 'menu';

export interface HudSettings {
  fps: boolean;
  ping: boolean;
  mass: boolean;
  minimap: boolean;
  leaderboard: boolean;
  grid: boolean;
  pellets: boolean;
  skins: boolean;
  names: boolean;
  cellMass: boolean;
  border: boolean;
  stats: boolean;
}

export interface Settings {
  version: 1;
  theme: Theme;
  nickname: string;
  mode: GameMode;
  skin: SkinId | null;
  color: string;
  /** KeyboardEvent.code per action. */
  keys: Record<Action, string>;
  /** Cursor sensitivity: scales the cursor offset from screen center. */
  sensitivity: number;
  botCount: number;
  /** Smooth cell size animations. */
  animations: boolean;
  hud: HudSettings;
}

export const ACTION_LABELS: Record<Action, string> = {
  split: 'Dividir',
  eject: 'Expulsar masa',
  doubleSplit: 'Doble división',
  maxSplit: 'División x16',
  menu: 'Menú / pausa',
};

export const HUD_LABELS: Record<keyof HudSettings, string> = {
  fps: 'FPS',
  ping: 'Ping (local)',
  mass: 'Puntuación / masa',
  minimap: 'Minimapa',
  leaderboard: 'Leaderboard',
  grid: 'Cuadrícula',
  pellets: 'Pellets',
  skins: 'Skins',
  names: 'Nombres',
  cellMass: 'Masa en células',
  border: 'Borde del mapa',
  stats: 'Estadísticas en vivo',
};

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: 'light',
  nickname: '',
  mode: 'ffa',
  skin: null,
  color: '#2ec4b6',
  keys: { split: 'Space', eject: 'KeyW', doubleSplit: 'KeyG', maxSplit: 'KeyT', menu: 'Escape' },
  sensitivity: 1,
  botCount: 40,
  animations: true,
  hud: {
    fps: true,
    ping: true,
    mass: true,
    minimap: true,
    leaderboard: true,
    grid: true,
    pellets: true,
    skins: true,
    names: true,
    cellMass: true,
    border: true,
    stats: false,
  },
};

export const STORAGE_KEY = 'mass-io:settings';

const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Merges stored data over defaults, discarding anything invalid. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return structuredClone(d);
  const r = raw as Partial<Settings>;
  const keys = { ...d.keys };
  if (r.keys && typeof r.keys === 'object') {
    for (const k of Object.keys(keys) as Action[]) {
      const v = (r.keys as unknown as Record<string, unknown>)[k];
      if (typeof v === 'string' && v) keys[k] = v;
    }
  }
  const hud = { ...d.hud };
  if (r.hud && typeof r.hud === 'object') {
    for (const k of Object.keys(hud) as (keyof HudSettings)[]) {
      const v = (r.hud as unknown as Record<string, unknown>)[k];
      if (typeof v === 'boolean') hud[k] = v;
    }
  }
  return {
    version: 1,
    theme: r.theme === 'dark' ? 'dark' : 'light',
    nickname: typeof r.nickname === 'string' ? r.nickname.slice(0, 15) : d.nickname,
    mode: r.mode === 'experimental' ? 'experimental' : 'ffa',
    skin: r.skin && (SKINS as readonly string[]).includes(r.skin) ? r.skin : null,
    color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : d.color,
    keys,
    sensitivity: clampNum(r.sensitivity, 0.3, 2.5, d.sensitivity),
    botCount: Math.round(clampNum(r.botCount, 0, 80, d.botCount)),
    animations: typeof r.animations === 'boolean' ? r.animations : d.animations,
    hud,
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings live for this session only */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Human readable label for a KeyboardEvent.code. */
export function keyLabel(code: string) {
  if (code === 'Space') return 'Espacio';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
