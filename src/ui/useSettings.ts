import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSettings, saveSettings, type Settings } from '../game/settings';

/** Settings state persisted to localStorage, plus a ref for the game loop to read without re-rendering. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const ref = useRef(settings);
  ref.current = settings;

  useEffect(() => {
    saveSettings(settings);
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Settings)) => {
    setSettings((s) => (typeof patch === 'function' ? patch(s) : { ...s, ...patch }));
  }, []);

  return { settings, update, ref };
}
