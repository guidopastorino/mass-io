/** Built-in skin identifiers. Artwork is generated procedurally by the renderer. */
export const SKINS = ['earth', 'moon', 'mars'] as const;
export type SkinId = (typeof SKINS)[number];
export const SKIN_LABELS: Record<SkinId, string> = { earth: 'Tierra', moon: 'Luna', mars: 'Marte' };
export const BOT_SKINS: readonly SkinId[] = SKINS;
