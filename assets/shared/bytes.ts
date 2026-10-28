const [FIRST_UNIT, ...LARGER_UNITS] = ['KB', 'MB', 'GB'] as const;
const UNIT_SIZE = 1024;
const FRACTION_DIGITS = 1;
/** Moves the one kept decimal to the units digit, so that rounding to a tenth is Math.round on a whole number. */
const TENTH_SCALE = 10 ** FRACTION_DIGITS;

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: FRACTION_DIGITS });

/**
 * A file size for people, the same as the Twig `bytes` filter (src/Twig/Extension/FormattingExtension.php):
 * "512 B", then KB, MB and GB with at most one decimal and the pt-BR separators ("1.023,9 KB").
 * Expects a non-negative whole number of bytes.
 */
export function formatBytes(bytes: number): string {
  if (bytes < UNIT_SIZE) {
    return `${String(bytes)} B`;
  }

  let value = bytes / UNIT_SIZE;
  let unit: string = FIRST_UNIT;
  for (const larger of LARGER_UNITS) {
    // Promote on the rounded value, so 1048575 B reads "1 MB" and not "1.024 KB".
    if (Math.round(value * TENTH_SCALE) < UNIT_SIZE * TENTH_SCALE) {
      break;
    }
    value /= UNIT_SIZE;
    unit = larger;
  }

  return `${decimal.format(value)} ${unit}`;
}
