import axe from 'axe-core';

type Target = axe.NodeResult['target'];

/**
 * Renders an axe-core target as one selector: nested parts (a path through shadow roots) are joined with " >>> ",
 * the remaining parts (frames) with a space.
 */
function describeTarget(target: Target): string {
  return target.map((part) => (typeof part === 'string' ? part : part.join(' >>> '))).join(' ');
}

/**
 * Fails the test with every axe-core violation found under root (rule id, help text and offending selectors).
 */
export async function expectNoAxeViolations(root: Element): Promise<void> {
  const { violations } = await axe.run(root);
  if (violations.length === 0) {
    return;
  }

  const report = violations
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => describeTarget(node.target)).join(', ')})`)
    .join('\n');

  throw new Error(`axe-core found ${String(violations.length)} violation(s):\n${report}`);
}
