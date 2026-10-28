const [FIRST_UNIT, ...LARGER_UNITS] = ['KB', 'MB', 'GB'] as const;

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * A file size for people, the same as the Twig `bytes` filter (src/Twig/Extension/FormattingExtension.php):
 * "512 B", then KB, MB and GB with at most one decimal and the pt-BR separators ("1.023,9 KB").
 * Expects a non-negative whole number of bytes.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  let value = bytes / 1024;
  let unit: string = FIRST_UNIT;
  for (const larger of LARGER_UNITS) {
    // Promote on the rounded value, so 1048575 B reads "1 MB" and not "1.024 KB".
    if (Math.round(value * 10) < 10_240) {
      break;
    }
    value /= 1024;
    unit = larger;
  }

  return `${decimal.format(value)} ${unit}`;
}
