import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor } from './contrast';

describe('parseColor', () => {
  it.each([
    ['#1f4e79', { red: 31, green: 78, blue: 121, alpha: 1 }],
    ['#FFF', { red: 255, green: 255, blue: 255, alpha: 1 }],
    ['#0f1722', { red: 15, green: 23, blue: 34, alpha: 1 }],
    ['rgb(244, 246, 249)', { red: 244, green: 246, blue: 249, alpha: 1 }],
    ['rgb(244 246 249)', { red: 244, green: 246, blue: 249, alpha: 1 }],
    ['rgba(255, 255, 255, 0.85)', { red: 255, green: 255, blue: 255, alpha: 0.85 }],
    ['rgb(255 255 255 / 85%)', { red: 255, green: 255, blue: 255, alpha: 0.85 }],
  ])('reads %s', (text, expected) => {
    expect(parseColor(text)).toEqual(expected);
  });

  it.each(['', 'red', '#12', '#12345', 'rgb(1, 2)', 'hsl(0 0% 0%)'])('refuses %j', (text) => {
    expect(() => parseColor(text)).toThrow('Cannot read the colour');
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#1f4e79', '#1f4e79')).toBeCloseTo(1, 5);
  });

  it('does not depend on which colour is the foreground', () => {
    expect(contrastRatio('#1f4e79', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#1f4e79'), 10);
  });

  it('matches the WCAG reference values around the 4.5:1 line', () => {
    // #767676 is the lightest grey that passes on white (4.54:1); one step lighter does not.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('accepts the notations the browser reports', () => {
    expect(contrastRatio('rgb(0, 0, 0)', '#fff')).toBeCloseTo(21, 5);
  });

  it('lays a translucent foreground over the background before comparing', () => {
    // White at 85% over the primary blue is a little darker than plain white, so it has less contrast with that blue.
    const solid = contrastRatio('#ffffff', '#1f4e79');
    const translucent = contrastRatio('rgba(255, 255, 255, 0.85)', '#1f4e79');

    expect(translucent).toBeLessThan(solid);
    expect(translucent).toBeGreaterThan(4.5);
  });

  it('refuses a translucent background, whose colour depends on what is behind it', () => {
    expect(() => contrastRatio('#ffffff', 'rgba(0, 0, 0, 0.5)')).toThrow('translucent background');
  });
});
