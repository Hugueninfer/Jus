import { afterEach, describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from './axe';

describe('expectNoAxeViolations', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('passes for accessible markup', async () => {
    document.body.innerHTML = '<main><button type="button">Salvar</button></main>';

    await expectNoAxeViolations(document.body);
  });

  it('fails and names the rule for inaccessible markup', async () => {
    document.body.innerHTML = '<main><button type="button"></button></main>';

    await expect(expectNoAxeViolations(document.body)).rejects.toThrow(/button-name/);
  });
});
