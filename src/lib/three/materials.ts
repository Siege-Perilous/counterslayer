/**
 * Shared material property constants for 3D rendering.
 * Centralizes material definitions to avoid duplication across components.
 */

// Standard counter material (tokens, chips, etc.)
export const COUNTER_MATERIAL = {
  roughness: 0.4,
  metalness: 0.2
} as const;

// Transparent sleeve material for sleeved cards
export const SLEEVE_MATERIAL = {
  roughness: 0.3,
  metalness: 0.1,
  opacity: 0.4,
  transparent: true
} as const;

// Inner card material (inside sleeves)
export const INNER_CARD_MATERIAL = {
  roughness: 0.5,
  metalness: 0.1
} as const;

// Tray material
export const TRAY_MATERIAL = {
  roughness: 0.6,
  metalness: 0.1
} as const;

// Box material
export const BOX_MATERIAL = {
  roughness: 0.6,
  metalness: 0.1,
  color: '#333333'
} as const;

// Lid material
export const LID_MATERIAL = {
  roughness: 0.6,
  metalness: 0.1,
  color: '#444444'
} as const;

/**
 * Generate alternating counter color based on stack index and counter index.
 * Used to create visual separation between stacked counters.
 */
export function getAlternateColor(stackIdx: number, isAlt: boolean, baseColor: string): string {
  if (!isAlt) return baseColor;
  // Cycle through different hues for variety
  const hues = [15, 25, 160, 35, 170];
  return `hsl(${hues[stackIdx % hues.length]}, 45%, 35%)`;
}

/**
 * Generate sleeve colors for sleeved card visualization.
 */
export function getSleeveColors(isAlt: boolean): { sleeve: string; innerCard: string } {
  return {
    sleeve: isAlt ? '#88c8e8' : '#78b8d8',
    innerCard: isAlt ? '#2a5a74' : '#1a4a64'
  };
}
