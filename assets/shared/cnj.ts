/**
 * Unique court case number (CNJ Resolution 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO.
 * Same rules as App\Domain\CnjNumber, checked against the same cases (tests/fixtures/cnj-numbers.json).
 */
const MASKED = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;
const UNMASKED = /^\d{20}$/;

/** Separators inserted after the given number of digits. */
const SEPARATORS = new Map<number, string>([[7, '-'], [9, '.'], [13, '.'], [14, '.'], [16, '.']]);

export type CnjAssessment = 'empty' | 'incomplete' | 'invalid' | 'valid';

export function parseCnj(value: string): string | null {
  const trimmed = value.trim();
  if (!MASKED.test(trimmed) && !UNMASKED.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/[-.]/g, '');

  return checkDigitsFor(digits.slice(0, 7) + digits.slice(9)) === digits.slice(7, 9) ? digits : null;
}

export function formatCnj(digits: string): string {
  return maskPartial(digits);
}

export function checkDigitsFor(eighteenDigits: string): string {
  let remainder = 0;
  for (const digit of `${eighteenDigits}00`) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return String(98 - remainder).padStart(2, '0');
}

export function maskPartial(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 20);
  let masked = '';
  // The separator goes before the digit at its index, so a trailing one never appears.
  for (let index = 0; index < digits.length; index++) {
    masked += (SEPARATORS.get(index) ?? '') + digits.charAt(index);
  }

  return masked;
}

export function assessCnj(value: string): CnjAssessment {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'empty';
  }
  if (trimmed.replace(/\D/g, '').length < 20) {
    return 'incomplete';
  }

  return parseCnj(trimmed) === null ? 'invalid' : 'valid';
}
