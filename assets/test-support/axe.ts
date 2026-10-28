import axe from 'axe-core';

/**
 * Fails the test with every axe-core violation found under root (rule id, help text and offending selectors).
 */
export async function expectNoAxeViolations(root: Element): Promise<void> {
  const { violations } = await axe.run(root);
  if (violations.length === 0) {
    return;
  }

  const report = violations
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`)
    .join('\n');

  throw new Error(`axe-core found ${String(violations.length)} violation(s):\n${report}`);
}
