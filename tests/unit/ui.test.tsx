import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../src/game/settings';
import { DeathScreen } from '../../src/ui/DeathScreen';
import { Hud } from '../../src/ui/Hud';
import { Menu } from '../../src/ui/Menu';
import { SettingsPanel } from '../../src/ui/SettingsPanel';

function SettingsHarness({ onChange }: { onChange: (s: Settings) => void }) {
  const [s, setS] = useState<Settings>(structuredClone(DEFAULT_SETTINGS));
  return (
    <SettingsPanel
      settings={s}
      update={(p) =>
        setS((prev) => {
          const next = typeof p === 'function' ? p(prev) : { ...prev, ...p };
          onChange(next);
          return next;
        })
      }
      onClose={() => {}}
    />
  );
}

describe('menu', () => {
  it('edits nickname, mode and skin, and plays', () => {
    const update = vi.fn();
    const onPlay = vi.fn();
    render(
      <Menu settings={DEFAULT_SETTINGS} update={update} onPlay={onPlay} onSettings={() => {}} canContinue={false} onContinue={() => {}} />,
    );
    fireEvent.change(screen.getByTestId('nickname'), { target: { value: 'Bob' } });
    expect(update).toHaveBeenCalledWith({ nickname: 'Bob' });
    fireEvent.click(screen.getByTestId('mode-experimental'));
    expect(update).toHaveBeenCalledWith({ mode: 'experimental' });
    fireEvent.click(screen.getByTestId('skin-mars'));
    expect(update).toHaveBeenCalledWith({ skin: 'mars' });
    fireEvent.click(screen.getByTestId('play'));
    expect(onPlay).toHaveBeenCalled();
  });

  it('shows Continue while alive', () => {
    const onContinue = vi.fn();
    render(
      <Menu settings={DEFAULT_SETTINGS} update={() => {}} onPlay={() => {}} onSettings={() => {}} canContinue onContinue={onContinue} />,
    );
    fireEvent.click(screen.getByTestId('continue'));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('settings panel', () => {
  it('rebinds a key and swaps conflicts', () => {
    let latest = DEFAULT_SETTINGS;
    render(<SettingsHarness onChange={(s) => (latest = s)} />);
    fireEvent.click(screen.getByTestId('tab-controls'));
    fireEvent.click(screen.getByTestId('bind-split'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    });
    expect(latest.keys.split).toBe('KeyW');
    expect(latest.keys.eject).toBe('Space');
  });

  it('toggles HUD options and theme', () => {
    let latest = DEFAULT_SETTINGS;
    render(<SettingsHarness onChange={(s) => (latest = s)} />);
    fireEvent.change(screen.getByTestId('theme'), { target: { value: 'dark' } });
    expect(latest.theme).toBe('dark');
    fireEvent.click(screen.getByTestId('tab-hud'));
    fireEvent.click(screen.getByTestId('hud-minimap'));
    expect(latest.hud.minimap).toBe(false);
  });
});

describe('hud and death screen', () => {
  const snap = {
    fps: 60, ping: 1.2, mass: 321, cells: 2, rank: 3, alive: true, myId: 7, players: 30, mode: 'ffa' as const,
    leaderboard: [{ id: 1, name: 'A', mass: 900, isHuman: false }, { id: 7, name: 'Me', mass: 321, isHuman: true }],
  };

  it('respects HUD toggles', () => {
    const { rerender } = render(<Hud snap={snap} hud={DEFAULT_SETTINGS.hud} />);
    expect(screen.getByTestId('fps').textContent).toContain('60');
    expect(screen.getByTestId('score').textContent).toContain('321');
    expect(screen.getByTestId('leaderboard').querySelector('.me')!.textContent).toContain('Me');
    rerender(<Hud snap={snap} hud={{ ...DEFAULT_SETTINGS.hud, fps: false, leaderboard: false, mass: false }} />);
    expect(screen.queryByTestId('fps')).toBeNull();
    expect(screen.queryByTestId('leaderboard')).toBeNull();
    expect(screen.queryByTestId('score')).toBeNull();
  });

  it('shows death stats and replays', () => {
    const onPlayAgain = vi.fn();
    render(
      <DeathScreen
        info={{
          killer: 'Nebula',
          timeAlive: 125,
          finalMass: 812,
          stats: { spawnedAt: 0, diedAt: 125, peakMass: 812.7, foodEaten: 140, cellsEaten: 3, virusesEaten: 1, bestRank: 2, massEaten: 900 },
        }}
        onPlayAgain={onPlayAgain}
        onMenu={() => {}}
      />,
    );
    expect(screen.getByText('Nebula')).toBeTruthy();
    expect(screen.getByText('2:05')).toBeTruthy();
    expect(screen.getByText('812')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('play-again'));
    expect(onPlayAgain).toHaveBeenCalled();
  });
});
