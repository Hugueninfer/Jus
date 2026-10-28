import { afterEach, describe, expect, it } from 'vitest';
import { installTokens } from './tokens';

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

describe('installTokens', () => {
  const removers: (() => void)[] = [];

  afterEach(() => {
    for (const remove of removers.splice(0)) {
      remove();
    }
  });

  it('defines the design tokens on the document', () => {
    expect(token('--jus-color-primary')).toBe('');

    removers.push(installTokens());

    expect(token('--jus-color-primary')).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(token('--jus-space-2')).toMatch(/rem$/);
    expect(token('--jus-focus-width')).not.toBe('');
  });

  it('takes the tokens off again', () => {
    const remove = installTokens();
    expect(token('--jus-color-primary')).not.toBe('');

    remove();

    expect(token('--jus-color-primary')).toBe('');
  });
});
