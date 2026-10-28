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

  it('fails and names the rule and the selector for inaccessible markup', async () => {
    document.body.innerHTML = '<main><button id="save" type="button"></button></main>';

    await expect(expectNoAxeViolations(document.body)).rejects.toThrow(/button-name: .*\(#save\)/);
  });

  it('reports selectors inside a shadow root as a readable path', async () => {
    document.body.innerHTML = '<main><div id="host"></div></main>';
    const host = document.getElementById('host');
    host?.attachShadow({ mode: 'open' }).setHTMLUnsafe('<button id="save" type="button"></button>');

    await expect(expectNoAxeViolations(document.body)).rejects.toThrow(/button-name: .*\(#host >>> #save\)/);
  });
});
