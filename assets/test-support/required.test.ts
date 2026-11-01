import { describe, expect, it } from 'vitest';
import { required } from './required';

describe('required', () => {
  it('returns the value it is given', () => {
    const element = document.createElement('div');

    expect(required(element)).toBe(element);
  });

  it.each([0, '', false])('returns the falsy value %j, which is still a value', (value) => {
    expect(required(value)).toBe(value);
  });

  it.each([null, undefined])('throws when it gets %s', (value) => {
    expect(() => required(value)).toThrow('Expected a value, got nothing.');
  });
});
