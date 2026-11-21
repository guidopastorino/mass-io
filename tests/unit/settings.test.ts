import { describe, expect, it } from 'vitest';
import { SKINS, SKIN_LABELS } from '../../src/engine/skins';
import { DEFAULT_SETTINGS, STORAGE_KEY, keyLabel, loadSettings, sanitizeSettings, saveSettings } from '../../src/game/settings';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('settings', () => {
  it('falls back to defaults on empty or corrupt storage', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    const s = memoryStorage();
    s.setItem(STORAGE_KEY, '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through storage', () => {
    const s = memoryStorage();
    const custom = {
      ...DEFAULT_SETTINGS,
      theme: 'dark' as const,
      nickname: 'Guido',
      mode: 'experimental' as const,
      skin: 'moon' as const,
      sensitivity: 1.4,
      keys: { ...DEFAULT_SETTINGS.keys, split: 'KeyQ' },
      hud: { ...DEFAULT_SETTINGS.hud, fps: false, minimap: false },
    };
    saveSettings(custom, s);
    expect(loadSettings(s)).toEqual(custom);
  });

  it('sanitizes invalid values and keeps valid ones', () => {
    const s = sanitizeSettings({
      theme: 'neon',
      mode: 'battle',
      skin: 'pluto',
      color: 'red',
      sensitivity: 99,
      botCount: -4,
      nickname: 'a'.repeat(40),
      keys: { split: 42, eject: 'KeyE' },
      hud: { fps: 'yes', grid: false },
    });
    expect(s.theme).toBe('light');
    expect(s.mode).toBe('ffa');
    expect(s.skin).toBeNull();
    expect(s.color).toBe(DEFAULT_SETTINGS.color);
    expect(s.sensitivity).toBe(2.5);
    expect(s.botCount).toBe(0);
    expect(s.nickname).toHaveLength(15);
    expect(s.keys.split).toBe('Space');
    expect(s.keys.eject).toBe('KeyE');
    expect(s.hud.fps).toBe(true);
    expect(s.hud.grid).toBe(false);
  });

  it('accepts every built-in skin and has a label for each', () => {
    expect(SKINS).toHaveLength(8);
    for (const id of SKINS) {
      expect(sanitizeSettings({ skin: id }).skin).toBe(id);
      expect(SKIN_LABELS[id]).toBeTruthy();
    }
  });

  it('labels keys for display', () => {
    expect(keyLabel('Space')).toBe('Espacio');
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit1')).toBe('1');
  });
});
