import { describe, expect, it } from 'vitest';
import fixtures from '../../tests/fixtures/cnj-numbers.json';
import { assessCnj, checkDigitsFor, formatCnj, maskPartial, parseCnj } from './cnj';

describe('parseCnj (shared cases with PHPUnit)', () => {
  it.each(fixtures.valid)('accepts $name', ({ input, digits, formatted }) => {
    expect(parseCnj(input)).toBe(digits);
    expect(formatCnj(digits)).toBe(formatted);
  });

  it.each(fixtures.invalid)('rejects $name', ({ input }) => {
    expect(parseCnj(input)).toBeNull();
  });
});

describe('checkDigitsFor', () => {
  it('pads the check digits to two characters', () => {
    expect(checkDigitsFor('000000320248260100')).toBe('09');
  });
});

describe('maskPartial', () => {
  it.each([
    ['', ''],
    ['0000001', '0000001'],
    ['00000013', '0000001-3'],
    ['000000139', '0000001-39'],
    ['0000001392', '0000001-39.2'],
    ['0000001392024826', '0000001-39.2024.8.26'],
    ['00000013920248260100', '0000001-39.2024.8.26.0100'],
    ['0000001-39.2024.8.26.0100', '0000001-39.2024.8.26.0100'],
    ['00000013920248260100999', '0000001-39.2024.8.26.0100'],
    ['abc 0000001x39', '0000001-39'],
  ])('masks %j as %j', (input, expected) => {
    expect(maskPartial(input)).toBe(expected);
  });
});

describe('assessCnj', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['0000001-39', 'incomplete'],
    ['0000001-40.2024.8.26.0100', 'invalid'],
    ['0000001-39.2024.8.26.0100', 'valid'],
  ] as const)('assesses %j as %s', (input, expected) => {
    expect(assessCnj(input)).toBe(expected);
  });
});
