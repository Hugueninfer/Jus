import { describe, expect, it } from 'vitest';
import { formatBytes } from './bytes';

// The same cases as the Twig `bytes` filter (tests/Unit/Twig/FormattingExtensionTest.php).
describe('formatBytes (shared cases with the Twig `bytes` filter)', () => {
  it.each([
    ['zero', 0, '0 B'],
    ['bytes', 512, '512 B'],
    ['just below a kilobyte', 1023, '1023 B'],
    ['kilobytes', 184_320, '180 KB'],
    ['megabytes with a decimal', 1_572_864, '1,5 MB'],
    ['whole megabytes', 10_485_760, '10 MB'],
    ['rounds half up', 1_280, '1,3 KB'],
    ['stays in kilobytes just below the promotion edge', 1_048_524, '1.023,9 KB'],
    ['promotes when rounding reaches the next unit', 1_048_575, '1 MB'],
    ['promotes to gigabytes after rounding', 1_073_741_823, '1 GB'],
    ['gigabytes are the last unit', 1_099_511_627_776, '1.024 GB'],
  ] as const)('formats %s: %d as %j', (_name, bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([
    [1_024, '1 KB'],
    [1_048_576, '1 MB'],
    [1_073_741_824, '1 GB'],
  ] as const)('starts a unit exactly at %d bytes', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('separates the number from the unit with a regular space, as the Twig filter does', () => {
    expect(formatBytes(184_320)).toBe('180 KB');
  });
});
