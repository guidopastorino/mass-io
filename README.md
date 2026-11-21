# Mass.io

Juego original de "comer células" para un jugador contra bots, hecho con **pnpm + React + Vite + TypeScript**. La UI usa React y el juego corre en Canvas 2D sobre un motor de simulación desacoplado.

## Cómo correrlo

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # Vitest (motor, bots, cámara, ajustes, UI)
pnpm test:e2e     # Playwright (requiere: pnpm exec playwright install chromium)
pnpm build
```

## Controles (configurables)

| Acción | Tecla |
| --- | --- |
| Mover | Mouse |
| Dividir | Espacio |
| Expulsar masa (mantener) | W |
| Doble división | G |
| División x16 | T |
| Bots: dividir / doble / x16 (modo Bots) | E / R / Y |
| Bots: expulsar masa hacia el cursor (mantener, modo Bots) | Q |
| Menú / pausa | Esc |
| Zoom | Rueda del mouse |

## Mecánicas

- `radio = sqrt(masa · 100)`; velocidad `2200 · radio^-0.439` u/s.
- Para comer hace falta 1,32× la masa del otro y cubrir su centro (`d < R − r/3`).
- Split: mitad de masa con un impulso de 780 u que decae exponencialmente; máximo 16 células; recombinación en `30 s + 2,33 % de la masa`.
- Eject: cuesta 18 de masa y lanza 13, con cooldown de 100 ms.
- Virus: al comerlos explotás en hasta 16 piezas. En FFA, alimentarlos 7 veces dispara un virus nuevo; en Experimental, alimentarlos los empuja.
- Experimental: spawners rojizos que producen pellets, absorben eject y células chicas y redistribuyen esa masa como pellets. Si una célula grande se come uno, gana su masa y explota igual que con un virus verde.
- Modo Bots: cada jugador (vos y cada IA) tiene hasta 3 minions con el nombre y la skin que elijas en el menú. Aparecen cerca tuyo, siguen tu cursor y se dividen con sus propias teclas; manteniendo Q expulsan masa hacia tu cursor, como la W de cualquier jugador (para alimentarte, apuntá a tu célula). Todos se pueden comer a todos: vos a tus bots, tus bots a vos y entre ellos. Al morir reaparecés cerca de tu bot vivo más grande (si no queda ninguno, en un lugar seguro al azar). Aparecen de a uno cada 4 s y los que mueren se reponen de a poco. Las células se recombinan 4 veces más rápido. En el minimapa se ven con un anillo blanco y no ocupan lugares del leaderboard.
- Cámara: zoom `pow(min(64/Σr, 1), 0.4)` escalado al viewport y ampliado para que todas tus células queden en pantalla; seguimiento y zoom suavizados, independientes del framerate.
- Bots: buscan comida, cazan, huyen, hacen split-kill solo cuando es seguro, disparan virus contra amenazas, evitan bordes y virus, merodean los spawners, se reagrupan y reaparecen.

## Estructura

```
src/engine   simulación pura (world, bots, camera, grid espacial, constantes)
src/render   renderer Canvas 2D y skins planetarias procedurales
src/game     game loop de paso fijo, input y ajustes persistentes
src/ui       componentes React (menú, ajustes, HUD, pantalla de muerte)
tests/unit   Vitest
tests/e2e    Playwright
```
