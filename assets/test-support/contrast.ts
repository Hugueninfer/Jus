// WCAG 2.2 colour contrast (success criterion 1.4.3), for tests that check a palette from the values the browser reports.

export interface Color {
  red: number;
  green: number;
  blue: number;
  /** 0 (transparent) to 1 (opaque). */
  alpha: number;
}

function fail(text: string): never {
  throw new Error(`Cannot read the colour ${JSON.stringify(text)}: expected #rgb, #rrggbb or rgb()/rgba().`);
}

function channel(text: string | undefined, original: string): number {
  if (text === undefined) {
    return fail(original);
  }

  return Number.parseInt(text, 10);
}

/**
 * Reads the notations a stylesheet or getComputedStyle() produces: #rgb, #rrggbb, rgb(r, g, b), rgba(r, g, b, a)
 * and the space-separated rgb(r g b / a). Anything else (names, hsl, color()) fails the test rather than guessing.
 */
export function parseColor(text: string): Color {
  const value = text.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? Array.from(hex, (digit) => digit + digit).join('') : hex;
    const [red, green, blue] = [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16));

    return { red: red ?? 0, green: green ?? 0, blue: blue ?? 0, alpha: 1 };
  }

  const functional = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[\s,/]\s*([\d.]+)(%?))?\s*\)$/.exec(value);
  if (functional === null) {
    return fail(text);
  }

  const [, red, green, blue, alpha, percent] = functional;
  const opacity = alpha === undefined ? 1 : Number.parseFloat(alpha) / (percent === '%' ? 100 : 1);

  return { red: channel(red, text), green: channel(green, text), blue: channel(blue, text), alpha: opacity };
}

function linear(channelValue: number): number {
  const scaled = channelValue / 255;

  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance({ red, green, blue }: Color): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** The colour a translucent foreground shows once laid over an opaque background. */
function over(foreground: Color, background: Color): Color {
  const mix = (top: number, bottom: number): number => Math.round(top * foreground.alpha + bottom * (1 - foreground.alpha));

  return {
    red: mix(foreground.red, background.red),
    green: mix(foreground.green, background.green),
    blue: mix(foreground.blue, background.blue),
    alpha: 1,
  };
}

/**
 * The contrast ratio of two colours, from 1 to 21. A translucent foreground is laid over the background first, as the
 * eye sees it; the background itself must be opaque.
 */
export function contrastRatio(foreground: string, background: string): number {
  const back = parseColor(background);
  if (back.alpha !== 1) {
    throw new Error(`Cannot measure contrast on a translucent background (${background}); pass the colour behind it.`);
  }

  const lighter = luminance(over(parseColor(foreground), back));
  const darker = luminance(back);
  const [high, low] = lighter >= darker ? [lighter, darker] : [darker, lighter];

  return (high + 0.05) / (low + 0.05);
}
