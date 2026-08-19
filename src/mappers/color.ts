import type { Color } from '../uiir'

/**
 * RGB do Figma vem em floats 0..1, sRGB. O IR usa hex — `#RRGGBB` quando opaco,
 * `#RRGGBBAA` quando nao.
 */
export function rgbToHex(color: RGB, alpha = 1): Color {
  const hex = `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
  const a = clamp01(alpha)
  return a >= 1 ? hex : `${hex}${channel(a)}`
}

function channel(value: number): string {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, '0')
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}
