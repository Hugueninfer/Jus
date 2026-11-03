#!/usr/bin/env node
/**
 * Audits the pages the application really renders, in the light and in the dark theme: axe-core (WCAG 2.0, 2.1 and 2.2,
 * levels A and AA) and horizontal scrolling at a desktop and a phone width, a keyboard pass with real key events on the
 * filing page, a pass with JavaScript turned off (search, tabs and a whole filing through plain links and forms), and a
 * check that the theme switcher of the navbar applies a theme and keeps it on reload, with and without JavaScript.
 *
 *   npm run audit:pages -- --base-url=http://127.0.0.1:8123
 *
 * It needs the application running with the demo data loaded (`composer setup`, `npm run build`, then
 * `php -S 127.0.0.1:<port> -t public` with `upload_max_filesize=10M` and `post_max_size=60M`) and signs in as the demo
 * lawyer. It drives the installed Google Chrome (no browser is downloaded). The audit files a few petitions in the demo
 * data (seven a run), as a person would; `composer setup` puts the data back. It is not part of `composer ci` because it
 * needs the application running.
 *
 * The theme comes from the `jus_tema` cookie, which every browser context of a theme carries from the start, and every
 * audited page must have been served in that theme (`data-bs-theme` and `data-jus-tema` on <html>). The browser is told to
 * prefer the other colour scheme: a cookie that did not reach the server leaves the page on "sistema", which follows the
 * browser, and so fails that check instead of auditing one theme twice.
 *
 * It refuses a `--base-url` that is not on this machine (localhost, 127.x.x.x, [::1]) unless `--allow-remote` is passed,
 * since it signs in with the demo account and files petitions.
 *
 * The exit code is 1 when anything fails (a violation, a horizontal scroll, a failed check) and 2 when the audit itself
 * could not run (Google Chrome is not installed, the server is not reachable, the demo account cannot sign in, a wrong
 * argument).
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const AXE_SOURCE_PATH = require.resolve('axe-core');
const SAMPLE_PDF = fileURLToPath(new URL('../../tests/fixtures/sample.pdf', import.meta.url));

const DEMO_USER = { email: 'advogado@jus.test', password: 'jus-demo' };
const AXE_OPTIONS = { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } };
const VIEWPORTS = [
  { name: '1280', width: 1280, height: 800 },
  { name: '375', width: 375, height: 812 },
];
const TIMEOUT_MS = 15_000;

/**
 * The themes the pages are audited in: the value of the cookie, what the server must then render on <html>, and the
 * colour scheme the browser is told to prefer (the other one, see above).
 */
const THEME_COOKIE = 'jus_tema';
const THEMES = [
  { name: 'claro', bootstrapTheme: 'light', colorScheme: 'dark' },
  { name: 'escuro', bootstrapTheme: 'dark', colorScheme: 'light' },
];

/** The page where the switcher is tried: public, so a visitor does it, and it opens no session. */
const SWITCHER_PAGE = '/design-system';

/** What went wrong, per page and width, for the report. */
const findings = [];

/** What was audited and what failed, per group (a theme, or the switcher), for the summary at the end. */
const tally = new Map();
let group = '';

/** The theme each browser context was made with, so that every page audited in it is checked against it. */
const contextThemes = new WeakMap();

function count(field, amount = 1) {
  const entry = tally.get(group) ?? { pages: 0, violations: 0, scrolls: 0, wrongTheme: 0, checks: 0, failedChecks: 0 };
  entry[field] += amount;
  tally.set(group, entry);
}

/** The audit could not run (as opposed to the pages failing it): the message says what to do, no stack needed. */
class AuditError extends Error {}

function log(text = '') {
  console.log(text);
}

const USAGE = 'Usage: npm run audit:pages -- --base-url=http://127.0.0.1:8000 [--allow-remote]';

/** The audit signs in with the demo account and files petitions, so it only runs against this machine unless told to. */
function isLoopback(hostname) {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127(\.\d{1,3}){3}$/.test(hostname);
}

function parseArguments(argv) {
  const options = { baseUrl: 'http://127.0.0.1:8000', allowRemote: false };
  for (const argument of argv) {
    const match = /^--base-url=(.+)$/.exec(argument);
    if (argument === '--allow-remote') {
      options.allowRemote = true;
    } else if (match === null) {
      throw new AuditError(`Unknown argument "${argument}". ${USAGE}`);
    } else {
      options.baseUrl = match[1].replace(/\/+$/, '');
    }
  }

  let url;
  try {
    url = new URL(options.baseUrl);
  } catch {
    throw new AuditError(`"${options.baseUrl}" is not a URL. ${USAGE}`);
  }
  if (!isLoopback(url.hostname) && !options.allowRemote) {
    throw new AuditError(
      `Refusing to audit ${url.origin}: it is not on this machine, and the audit signs in with the demo account and files petitions. ` +
        'Pass --allow-remote if that server is yours to change.',
    );
  }

  return options;
}

// ---------------------------------------------------------------------------------------------------------------------
// axe-core and the layout check
// ---------------------------------------------------------------------------------------------------------------------

let axeSource = '';

/** Runs axe on the page as it is now (axe is evaluated in the page, so the page must be allowed to run scripts). */
async function runAxe(page) {
  return page.evaluate(`(async () => {
    ${axeSource}
    return axe.run(document, ${JSON.stringify(AXE_OPTIONS)});
  })()`);
}

async function measureScroll(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

/** A rule axe could not decide on, with the first element it stopped at. */
function describeIncomplete(item) {
  const [first] = item.nodes;
  const more = item.nodes.length > 1 ? `, +${String(item.nodes.length - 1)}` : '';

  return `${item.id} (${first?.target.join(' ') ?? '?'}${more})`;
}

function describeViolation(violation) {
  return {
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      selector: node.target.join(' '),
      summary: (node.failureSummary ?? '').replace(/\s+/g, ' ').trim(),
    })),
  };
}

/** The theme <html> is in, as the server rendered it (and the inline script, for "sistema", resolved it). */
async function themeOf(page) {
  const root = page.locator('html');
  // Read through locators, not page.evaluate(): they also work where the page runs no scripts.
  const [bootstrapTheme, choice] = await Promise.all([root.getAttribute('data-bs-theme'), root.getAttribute('data-jus-tema')]);

  return { bootstrapTheme: bootstrapTheme ?? '', choice: choice ?? '' };
}

function describeTheme(theme) {
  return `data-bs-theme="${theme.bootstrapTheme}", data-jus-tema="${theme.choice}"`;
}

/**
 * Audits the page in its current state; `label` is "page · state", `mode` the theme, the width and whether scripts run.
 * The page must be in the theme its browser context was made with.
 */
async function auditPage(page, label, mode, { expectedStatus, status } = {}) {
  const expectedTheme = contextThemes.get(page.context());
  const [axeResults, scroll, theme] = await Promise.all([runAxe(page), measureScroll(page), themeOf(page)]);
  const violations = axeResults.violations.map(describeViolation);
  const overflow = scroll.scrollWidth > scroll.innerWidth;
  const statusWrong = expectedStatus !== undefined && status !== expectedStatus;
  const themeWrong = expectedTheme === undefined || theme.bootstrapTheme !== expectedTheme.bootstrapTheme || theme.choice !== expectedTheme.name;
  const entry = { label, mode, violations, scroll, overflow, status, statusWrong, theme, themeWrong, review: axeResults.incomplete.map(describeIncomplete) };

  const problems = [];
  if (violations.length > 0) {
    problems.push(`${String(violations.length)} violation${violations.length === 1 ? '' : 's'}`);
  }
  if (overflow) {
    problems.push(`horizontal scroll (${String(scroll.scrollWidth)} > ${String(scroll.innerWidth)} px)`);
  }
  if (statusWrong) {
    problems.push(`status ${String(status)}, expected ${String(expectedStatus)}`);
  }
  if (themeWrong) {
    const wanted = expectedTheme === undefined ? 'a context made for a theme' : `data-bs-theme="${expectedTheme.bootstrapTheme}", data-jus-tema="${expectedTheme.name}"`;
    problems.push(`served with ${describeTheme(theme)}, expected ${wanted}`);
  }
  count('pages');
  count('violations', violations.length);
  count('scrolls', overflow ? 1 : 0);
  count('wrongTheme', themeWrong ? 1 : 0);

  const scrollText = `${String(axeResults.passes.length)} rules passed, scrollWidth ${String(scroll.scrollWidth)} <= ${String(scroll.innerWidth)}, ${theme.bootstrapTheme}`;
  log(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${mode.padEnd(26)} ${label}${problems.length === 0 ? `  (0 violations, ${scrollText})` : `  <- ${problems.join('; ')}`}`);
  for (const violation of violations) {
    log(`       ${violation.rule} (${violation.impact ?? 'n/a'}): ${violation.help}`);
    log(`       ${violation.helpUrl}`);
    for (const node of violation.nodes) {
      log(`         - ${node.selector}`);
      if (node.summary !== '') {
        log(`           ${node.summary}`);
      }
    }
  }
  if (entry.review.length > 0) {
    log(`       (axe could not decide, reviewed by eye: ${entry.review.join('; ')})`);
  }
  if (problems.length > 0) {
    findings.push(entry);
  }

  return entry;
}

// ---------------------------------------------------------------------------------------------------------------------
// Checks that are not axe rules: keyboard and no-JavaScript behaviour
// ---------------------------------------------------------------------------------------------------------------------

function check(name, passed, detail = '') {
  log(`${passed ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : `  (${detail})`}`);
  count('checks');
  if (!passed) {
    count('failedChecks');
    findings.push({ label: name, check: true, detail });
  }

  return passed;
}

/** The element with the focus, looking inside shadow roots, as something a report can print. */
async function activeElement(page) {
  return page.evaluate(() => {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) {
      element = element.shadowRoot.activeElement;
    }
    if (!element || element === document.body) {
      return { tag: 'body', id: '', name: '', type: '', label: '' };
    }
    return {
      tag: element.localName,
      id: element.id,
      name: element.getAttribute('name') ?? '',
      type: element.getAttribute('type') ?? '',
      label: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
    };
  });
}

function nameOf(element) {
  return `${element.tag}${element.id === '' ? '' : `#${element.id}`}${element.label === '' ? '' : ` "${element.label}"`}`;
}

/** Presses Tab until `matches` says the focused element is the one wanted, and returns what was visited (or null). */
async function tabTo(page, matches, limit = 60) {
  const visited = [];
  for (let presses = 0; presses < limit; presses++) {
    await page.keyboard.press('Tab');
    const element = await activeElement(page);
    visited.push(element);
    if (matches(element)) {
      return visited;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------------------------------------------------

/** A browser context in a theme: the cookie is there before the first request, as if the person had chosen it earlier. */
async function newThemedContext(browser, baseUrl, theme, options) {
  const context = await browser.newContext({ ...options, colorScheme: theme.colorScheme });
  context.setDefaultTimeout(TIMEOUT_MS);
  await context.addCookies([{ name: THEME_COOKIE, value: theme.name, url: baseUrl }]);
  contextThemes.set(context, theme);

  return context;
}

async function open(page, baseUrl, path) {
  let response;
  try {
    response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'load' });
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
    throw new AuditError(`Could not open ${baseUrl}${path} (${reason}). Is the application running at that address?`);
  }

  return response?.status();
}

async function signIn(page, baseUrl) {
  await open(page, baseUrl, '/login');
  await page.fill('#username', DEMO_USER.email);
  await page.fill('#password', DEMO_USER.password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('form[action$="/login"] button[type="submit"]')]);
  if (!new URL(page.url()).pathname.startsWith('/processos')) {
    throw new AuditError(
      `Signing in as ${DEMO_USER.email} did not work (the browser ended on ${page.url()}). Is the demo data missing? Run "composer setup".`,
    );
  }
}

/** The first case, from the search results, where the demo lawyer can file (the case page offers "Peticionar"). */
async function findFilingCase(page, baseUrl) {
  await open(page, baseUrl, '/processos');
  const hrefs = await page.locator('.jus-case-list a.stretched-link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  for (const href of hrefs) {
    await open(page, baseUrl, href);
    const filingLink = await page.locator('a.btn-primary[href$="/peticionar"]').count();
    if (filingLink > 0) {
      return href;
    }
  }
  throw new AuditError('No case in the search results lets the demo lawyer file a petition. Is the demo data missing? Run "composer setup".');
}

/** A small fixture is enough for the server: it checks the content, so the sample PDF is sent under other names too. */
async function samplePdfs(...names) {
  const buffer = await readFile(SAMPLE_PDF);

  return names.map((name) => ({ name, mimeType: 'application/pdf', buffer }));
}

/** Submits the filing form with nothing filled in, past the browser's own checks, to get the server's 422 page. */
async function submitEmptyFiling(page) {
  await page.evaluate(() => {
    document.querySelector('form[data-jus-submit-once]').noValidate = true;
  });
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === 'POST'),
    page.click('form[data-jus-submit-once] button[type="submit"]'),
  ]);
  await page.waitForLoadState('load');

  return response.status();
}

async function fillFiling(page, files) {
  await page.selectOption('#filing_type', { index: 1 });
  await page.fill('#filing_description', 'Petição enviada pela auditoria das páginas.');
  await page.setInputFiles('#filing_files', files);
}

// ---------------------------------------------------------------------------------------------------------------------
// The audit with JavaScript on
// ---------------------------------------------------------------------------------------------------------------------

async function auditViewport(browser, baseUrl, theme, viewport, state) {
  const mode = `${theme.name} ${viewport.name} px`;
  log('');
  log(`== ${theme.name} · ${viewport.name} px, JavaScript on ==`);

  const context = await newThemedContext(browser, baseUrl, theme, { viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Signed out
  let status = await open(page, baseUrl, '/login');
  await auditPage(page, 'login (signed out)', mode, { expectedStatus: 200, status });

  await signIn(page, baseUrl);

  // Search
  status = await open(page, baseUrl, '/processos');
  await auditPage(page, 'search · results', mode, { expectedStatus: 200, status });

  status = await open(page, baseUrl, '/processos?parte=zzzz-ninguem');
  await auditPage(page, 'search · no results', mode, { expectedStatus: 200, status });

  // The case
  state.caseHref ??= await findFilingCase(page, baseUrl);
  const caseHref = state.caseHref;

  status = await open(page, baseUrl, `${caseHref}?aba=movimentacoes`);
  await auditPage(page, 'case · Movimentações', mode, { expectedStatus: 200, status });

  status = await open(page, baseUrl, `${caseHref}?aba=documentos`);
  await auditPage(page, 'case · Documentos', mode, { expectedStatus: 200, status });

  // Filing
  status = await open(page, baseUrl, `${caseHref}/peticionar`);
  await auditPage(page, 'filing · empty', mode, { expectedStatus: 200, status });

  status = await submitEmptyFiling(page);
  await auditPage(page, 'filing · validation errors', mode, { expectedStatus: 422, status });

  await open(page, baseUrl, `${caseHref}/peticionar`);
  await fillFiling(page, await samplePdfs('peticao-1.pdf', 'anexo-2.pdf'));
  await auditPage(page, 'filing · files chosen', mode);

  await Promise.all([page.waitForURL(/aba=movimentacoes/), page.click('form[data-jus-submit-once] button[type="submit"]')]);
  await page.waitForLoadState('load');
  const confirmed = (await page.locator('#andamento ~ .alert-success').count()) > 0;
  check(`${mode}: a filing lands on the case page with its confirmation`, confirmed);
  await auditPage(page, 'case · after a filing (confirmation)', mode);

  // Where the focus goes does not depend on the colours, so the keyboard pass (which files a petition) runs in one theme.
  if (viewport.name === '1280' && theme === THEMES[0]) {
    await keyboardPass(page, baseUrl, caseHref, mode);
  }

  // The application's own error pages. `/_error/{code}` renders them in the dev environment, where an unknown address
  // would show Symfony's exception page instead (a page that is not ours to audit); in production the same address is
  // simply unknown and gets the 404 page.
  for (const code of [404, 403, 500]) {
    status = await open(page, baseUrl, `/_error/${String(code)}`);
    await auditPage(page, `error page ${String(code)}`, mode, { expectedStatus: code, status });
    const heading = (await page.locator('main#conteudo h1').allInnerTexts()).map((text) => text.trim());
    check(`${mode}: the ${String(code)} page has one h1 in main#conteudo`, heading.length === 1, heading.join(' | '));
  }

  // The catalogue

  status = await open(page, baseUrl, '/design-system');
  await auditPage(page, 'design system', mode, { expectedStatus: 200, status });

  // The menu is an off-canvas panel on a phone: audit it open, too.
  if (viewport.width < 768) {
    await open(page, baseUrl, '/processos');
    await page.click('button.navbar-toggler');
    await page.waitForSelector('#menu-principal.show');
    await page.waitForFunction(() => !document.querySelector('#menu-principal').classList.contains('showing'));
    await auditPage(page, 'search · menu open', mode);
  }

  check(`${mode}: no uncaught script errors`, pageErrors.length === 0, pageErrors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------
// The keyboard pass (1280 px, JavaScript on)
// ---------------------------------------------------------------------------------------------------------------------

async function keyboardPass(page, baseUrl, caseHref, mode) {
  log('');
  log(`-- keyboard pass (${mode}) --`);
  const keyCheck = (name, passed, detail) => check(`${mode}, keyboard: ${name}`, passed, detail);

  // The skip link is the first stop and takes the focus to the main content.
  await open(page, baseUrl, caseHref);
  await page.keyboard.press('Tab');
  const first = await activeElement(page);
  keyCheck('skip link: the first Tab stop is "Pular para o conteúdo"', first.tag === 'a' && first.label === 'Pular para o conteúdo', nameOf(first));
  await page.keyboard.press('Enter');
  const afterSkip = await activeElement(page);
  keyCheck('skip link: Enter moves the focus to main#conteudo', afterSkip.id === 'conteudo', nameOf(afterSkip));

  // The error summary after an empty submit.
  await open(page, baseUrl, `${caseHref}/peticionar`);
  const status = await submitEmptyFiling(page);
  keyCheck('filing: an empty submit answers 422', status === 422, String(status));

  const targets = await page.locator('#resumo-erros a').evaluateAll((links) => links.map((link) => link.getAttribute('href')?.slice(1) ?? ''));
  keyCheck('filing: the error summary links to the three fields', targets.join(',') === 'filing_type,filing_description,filing_files', targets.join(','));
  for (const target of targets) {
    await open(page, baseUrl, `${caseHref}/peticionar`);
    await submitEmptyFiling(page);
    await page.locator(`#resumo-erros a[href="#${target}"]`).focus();
    await page.keyboard.press('Enter');
    const focused = await activeElement(page);
    keyCheck(`filing: Enter on the summary link to #${target} moves the focus to the field`, focused.id === target, nameOf(focused));
  }

  // Tab order from the summary on: type, description, file input, submit.
  await open(page, baseUrl, `${caseHref}/peticionar`);
  await submitEmptyFiling(page);
  await page.locator('#resumo-erros a').last().focus();
  for (const [label, matches] of [
    ['the type select', (element) => element.id === 'filing_type'],
    ['the description', (element) => element.id === 'filing_description'],
    ['the file input', (element) => element.id === 'filing_files'],
    ['the submit button', (element) => element.tag === 'button' && element.type === 'submit'],
  ]) {
    const visited = await tabTo(page, matches, 6);
    keyCheck(`filing: Tab reaches ${label}`, visited !== null, visited === null ? '' : visited.map(nameOf).join(' > '));
  }

  // The remove buttons, after choosing files.
  await open(page, baseUrl, `${caseHref}/peticionar`);
  await page.setInputFiles('#filing_files', await samplePdfs('primeiro.pdf', 'segundo.pdf'));
  await page.locator('#filing_files').focus();
  const toRemove = await tabTo(page, (element) => element.tag === 'button' && element.label.startsWith('Remover'), 4);
  keyCheck('filing: Tab goes from the file input to a "Remover" button', toRemove !== null, toRemove === null ? '' : toRemove.map(nameOf).join(' > '));
  if (toRemove !== null) {
    await page.keyboard.press('Enter');
    const afterRemoval = await activeElement(page);
    const remaining = await page.locator('jus-upload li').count();
    keyCheck('filing: Enter on "Remover" removes the file and keeps the focus on a "Remover" button', remaining === 1 && afterRemoval.label.startsWith('Remover'), `${String(remaining)} left, focus on ${nameOf(afterRemoval)}`);
    const next = await tabTo(page, (element) => element.tag === 'button' && element.type === 'submit', 3);
    keyCheck('filing: Tab then reaches the submit button', next !== null);
  }

  // Closing the confirmation of a filing from the keyboard keeps the focus near it.
  await open(page, baseUrl, `${caseHref}/peticionar`);
  await fillFiling(page, await samplePdfs('peticao-teclado.pdf'));
  await page.focus('form[data-jus-submit-once] button[type="submit"]');
  await Promise.all([page.waitForURL(/aba=movimentacoes/), page.keyboard.press('Enter')]);
  await page.waitForLoadState('load');
  const closeButton = page.locator('#andamento ~ .alert-success button.btn-close');
  keyCheck('filing: submitting with Enter lands on the case page with the confirmation', (await closeButton.count()) === 1);
  if ((await closeButton.count()) === 1) {
    await closeButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#andamento ~ .alert-success') === null);
    const landed = await activeElement(page);
    keyCheck('alert: closing the confirmation with Enter keeps the focus in the page (on #andamento, not at the top)', landed.id === 'andamento', nameOf(landed));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The audit with JavaScript off
// ---------------------------------------------------------------------------------------------------------------------

/**
 * With JavaScript turned off nothing can be evaluated in the page, not even axe. So the page the browser got is audited
 * in a page that allows scripts but has the application's bundle blocked: the same markup and styles, with none of the
 * enhancements, at every width.
 */
async function auditAsServed(plain, views, label, { status, expectedStatus } = {}) {
  const url = plain.url().split('#')[0];
  // A browser with scripting off treats what is inside <noscript> as markup, and serializes it so; a page that runs scripts
  // would take it for text. Unwrapping it keeps the styles that exist for the no-JS case in effect. The inline scripts of
  // the page (the theme script of the head, the one that folds the search filters on a phone) go, for the same reason as
  // the bundle: a browser with scripting off never runs them, and the filters, say, stay open there.
  const html = (await plain.content()).replace(/<\/?noscript[^>]*>/g, '').replace(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g, '');
  // The same matcher and handler that added the route remove it: unrouting by the URL would not find a route made with a function.
  const matches = (candidate) => candidate.href === url;
  const serve = (route) => route.fulfill({ status: status ?? 200, contentType: 'text/html; charset=utf-8', body: html });
  for (const view of views) {
    await view.page.route(matches, serve);
    try {
      await view.page.goto(url, { waitUntil: 'load' });
      await auditPage(view.page, label, `${view.mode}, as served`, { expectedStatus, status });
    } finally {
      await view.page.unroute(matches, serve);
    }
  }
}

/**
 * The box an element occupies once it stops moving: a resize can start a CSS transition (Bootstrap slides the off-canvas
 * panel for 0.3 s), and a box read in the middle of one says nothing about where the element ends up.
 */
async function settledBox(locator) {
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(100);
    const current = await locator.boundingBox();
    if (JSON.stringify(current) === JSON.stringify(previous)) {
      return current;
    }
    previous = current;
  }

  return previous;
}

/**
 * With scripts really off, at each width: every link of the main navigation lies inside the window, by the box it
 * occupies (a panel that is "visible" but slid out of the window does not pass). The window goes back to desktop size.
 */
async function checkMenuInsideWindow(page, mode) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const links = await page.locator('#menu-principal a.nav-link').all();
    const outside = [];
    for (const link of links) {
      const box = await settledBox(link);
      const name = ((await link.textContent()) ?? '').trim();
      const inside = box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
      if (!inside) {
        const where = box === null ? 'no box' : `x ${String(Math.round(box.x))}, y ${String(Math.round(box.y))}, ${String(Math.round(box.width))}x${String(Math.round(box.height))}`;
        outside.push(`${name}: ${where}`);
      }
    }
    check(
      `${mode}, ${viewport.name} px: the main navigation links (${String(links.length)}) are inside the window`,
      links.length >= 3 && outside.length === 0,
      outside.join('; '),
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function auditWithoutScripts(browser, baseUrl, theme, state) {
  const mode = `${theme.name}, no JS`;
  const noScriptCheck = (name, passed, detail) => check(`${mode}: ${name}`, passed, detail);
  log('');
  log(`== ${theme.name} · no JS (javaScriptEnabled: false, 1280 px; the served pages also at 375 px) ==`);

  const context = await newThemedContext(browser, baseUrl, theme, { viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  const plain = await context.newPage();

  // The views get the page from the context without scripts, but they are made for the theme too: what they audit must
  // be in it.
  const views = [];
  for (const viewport of VIEWPORTS) {
    const viewContext = await newThemedContext(browser, baseUrl, theme, { viewport: { width: viewport.width, height: viewport.height } });
    await viewContext.route('**/build/**/*.js', (route) => route.abort());
    views.push({ mode: `${theme.name} ${viewport.name} px`, context: viewContext, page: await viewContext.newPage() });
  }

  let status = await open(plain, baseUrl, '/login');
  noScriptCheck('the sign-in page responds with its form', status === 200 && (await plain.locator('form[action$="/login"] button[type="submit"]').count()) === 1, String(status));
  await auditAsServed(plain, views, 'login (signed out)', { expectedStatus: 200, status });
  await signIn(plain, baseUrl);
  noScriptCheck('signing in with the plain form works', plain.url().includes('/processos'), plain.url());

  // Search: a plain GET form.
  status = await open(plain, baseUrl, '/processos');
  await auditAsServed(plain, views, 'search · results', { expectedStatus: 200, status });
  await checkMenuInsideWindow(plain, mode);
  await plain.fill('#parte', 'zzzz-ninguem');
  await Promise.all([plain.waitForURL(/parte=zzzz/), plain.click('form[role="search"] button[type="submit"]')]);
  const empty = await plain.getByText('Nenhum processo encontrado.').count();
  noScriptCheck('the search form filters by party and says when nothing was found', empty > 0, plain.url());
  await auditAsServed(plain, views, 'search · no results');

  // Tabs: plain links.
  const caseHref = state.caseHref;
  status = await open(plain, baseUrl, caseHref);
  await auditAsServed(plain, views, 'case · Movimentações', { expectedStatus: 200, status });
  await Promise.all([plain.waitForURL(/aba=documentos/), plain.getByRole('link', { name: 'Documentos' }).click()]);
  noScriptCheck('the Documentos tab is a link and shows the documents table', (await plain.locator('table').count()) > 0, plain.url());
  await auditAsServed(plain, views, 'case · Documentos');
  await Promise.all([plain.waitForURL(/aba=movimentacoes/), plain.getByRole('link', { name: 'Movimentações' }).click()]);
  noScriptCheck('the Movimentações tab is a link and shows the timeline', (await plain.locator('.jus-timeline-event').count()) > 0, plain.url());

  // Filing: a plain multipart POST, the whole way.
  status = await open(plain, baseUrl, `${caseHref}/peticionar`);
  await auditAsServed(plain, views, 'filing · empty', { expectedStatus: 200, status });
  await fillFiling(plain, await samplePdfs('peticao-sem-js.pdf'));
  await Promise.all([plain.waitForURL(/aba=movimentacoes/), plain.click('form[data-jus-submit-once] button[type="submit"]')]);
  await plain.waitForLoadState('load');
  const confirmation = await plain.getByText('Petição juntada ao processo.').count();
  noScriptCheck('a whole filing succeeds and lands on the case page with the confirmation', confirmation > 0 && plain.url().includes('#andamento'), plain.url());
  await auditAsServed(plain, views, 'case · after a filing (confirmation)');

  status = await open(plain, baseUrl, '/design-system');
  await auditAsServed(plain, views, 'design system', { expectedStatus: 200, status });

  for (const view of views) {
    await view.context.close();
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------
// The theme switcher: choosing a theme applies it and keeps it on reload, with and without JavaScript
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The button of a theme in the switcher of the navbar. On a phone the switcher is in the off-canvas menu, which a script
 * opens first; without scripts the menu is already shown as a block under the brand (the <noscript> style of the layout).
 */
async function themeButton(page, value) {
  const button = page.locator(`form[data-jus-theme-switcher] button[name="tema"][value="${value}"]`);
  if (!(await button.isVisible())) {
    await page.click('button.navbar-toggler');
    await page.waitForSelector('#menu-principal.show');
    await page.waitForFunction(() => !document.querySelector('#menu-principal').classList.contains('showing'));
  }

  return button;
}

function isThemePost(response) {
  return response.request().method() === 'POST' && new URL(response.url()).pathname === '/tema';
}

/** The page is in the theme, and the switcher says so: the one pressed button is the choice. */
async function checkShownTheme(page, name, expected) {
  const theme = await themeOf(page);
  const pressed = page.locator('form[data-jus-theme-switcher] button[name="tema"][aria-pressed="true"]');
  const pressedValues = await Promise.all((await pressed.all()).map((button) => button.getAttribute('value')));
  check(
    name,
    theme.bootstrapTheme === expected.bootstrapTheme && theme.choice === expected.choice && pressedValues.join(',') === expected.choice,
    `${describeTheme(theme)}, pressed: ${pressedValues.join(',') || 'none'}`,
  );
}

/** The cookie the switch left: the choice, HttpOnly, SameSite=Lax, for a year; and no other cookie (a visitor gets no session). */
async function checkThemeCookie(context, name, value) {
  const cookies = await context.cookies();
  const cookie = cookies.find((candidate) => candidate.name === THEME_COOKIE);
  const others = cookies.filter((candidate) => candidate.name !== THEME_COOKIE).map((candidate) => candidate.name);
  const days = cookie === undefined ? 0 : (cookie.expires * 1000 - Date.now()) / 86_400_000;
  check(
    name,
    cookie?.value === value && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.path === '/' && days > 364 && days < 367 && others.length === 0,
    cookie === undefined ? 'no cookie' : `${cookie.value}, httpOnly ${String(cookie.httpOnly)}, ${cookie.sameSite}, ${String(Math.round(days))} days${others.length > 0 ? `; also ${others.join(', ')}` : ''}`,
  );
}

const SYSTEM_LIGHT = { bootstrapTheme: 'light', choice: 'sistema' };
const DARK = { bootstrapTheme: 'dark', choice: 'escuro' };

/**
 * With scripts: the click changes the page at once (no page load) and the choice is saved in the background (204); the
 * reloaded page comes from the server in that theme. Then "Sistema" again, which the browser (told to prefer light)
 * resolves to the light theme, and the context is thrown away: nothing is left behind.
 */
async function switchWithScripts(browser, baseUrl, viewport) {
  const mode = `switcher, JS, ${viewport.name} px`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: 'light' });
  context.setDefaultTimeout(TIMEOUT_MS);
  try {
    const page = await context.newPage();
    await open(page, baseUrl, SWITCHER_PAGE);
    await checkShownTheme(page, `${mode}: without the cookie the page follows the system (light here)`, SYSTEM_LIGHT);

    for (const [value, expected, announcement] of [
      ['escuro', DARK, 'Tema escuro aplicado.'],
      ['sistema', SYSTEM_LIGHT, 'Tema do sistema aplicado.'],
    ]) {
      const button = await themeButton(page, value);
      await page.evaluate(() => {
        window.jusAuditMark = true;
      });
      const saved = page.waitForResponse(isThemePost);
      await button.click();
      await checkShownTheme(page, `${mode}: "${value}" is applied at once`, expected);
      const response = await saved;
      const stayed = await page.evaluate(() => window.jusAuditMark === true);
      check(`${mode}: "${value}" is saved in the background (204), without leaving the page`, response.status() === 204 && stayed, `${String(response.status())}, ${stayed ? 'same page' : 'the page was loaded again'}`);
      let said = true;
      try {
        await page.waitForFunction((text) => document.querySelector('[data-jus-theme-status]')?.textContent === text, announcement, { timeout: 2_000 });
      } catch {
        said = false;
      }
      check(`${mode}: "${value}" is announced ("${announcement}")`, said);
      await checkThemeCookie(context, `${mode}: "${value}" is kept in the cookie`, value);

      await page.reload({ waitUntil: 'load' });
      await checkShownTheme(page, `${mode}: "${value}" is still there after a reload`, expected);
    }
  } finally {
    await context.close();
  }
}

/**
 * Without scripts: the button posts the form, the server answers 303 back to the same page, which comes in the theme;
 * a reload keeps it. Then "Sistema" again, which without scripts is the light theme.
 */
async function switchWithoutScripts(browser, baseUrl, viewport) {
  const mode = `switcher, no JS, ${viewport.name} px`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: 'light', javaScriptEnabled: false });
  context.setDefaultTimeout(TIMEOUT_MS);
  try {
    const page = await context.newPage();
    await open(page, baseUrl, SWITCHER_PAGE);
    await checkShownTheme(page, `${mode}: without the cookie the page is light`, SYSTEM_LIGHT);

    for (const [value, expected] of [
      ['escuro', DARK],
      ['sistema', SYSTEM_LIGHT],
    ]) {
      const button = await themeButton(page, value);
      const posted = page.waitForResponse(isThemePost);
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), button.click()]);
      const response = await posted;
      const location = response.headers().location ?? '';
      const back = new URL(page.url());
      check(
        `${mode}: "${value}" posts the form and comes back to the same page (303)`,
        response.status() === 303 && location === SWITCHER_PAGE && `${back.origin}${back.pathname}${back.search}` === `${baseUrl}${SWITCHER_PAGE}`,
        `${String(response.status())} to ${location}, ended on ${page.url()}`,
      );
      await checkShownTheme(page, `${mode}: the page comes back in "${value}"`, expected);
      await checkThemeCookie(context, `${mode}: "${value}" is kept in the cookie`, value);

      await page.reload({ waitUntil: 'load' });
      await checkShownTheme(page, `${mode}: "${value}" is still there after a reload`, expected);
    }
  } finally {
    await context.close();
  }
}

async function checkThemeSwitcher(browser, baseUrl) {
  log('');
  log(`== theme switcher (a visitor on ${SWITCHER_PAGE}, in a browser that prefers light; a fresh browser context each) ==`);
  for (const viewport of VIEWPORTS) {
    await switchWithScripts(browser, baseUrl, viewport);
  }
  for (const viewport of VIEWPORTS) {
    await switchWithoutScripts(browser, baseUrl, viewport);
  }
}

// ---------------------------------------------------------------------------------------------------------------------

/** The audit drives the Google Chrome installed on this machine; without it Playwright's own message is a long stack. */
async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
    throw new AuditError(`Could not start Google Chrome (${reason}). Install Google Chrome: the audit uses the installed browser and downloads none.`);
  }
}

async function main() {
  const { baseUrl } = parseArguments(process.argv.slice(2));
  axeSource = await readFile(AXE_SOURCE_PATH, 'utf8');

  log(`Jus page audit — ${baseUrl}`);
  log(`axe-core rules: ${AXE_OPTIONS.runOnly.values.join(', ')}`);

  const browser = await launchChrome();
  const state = {};
  try {
    for (const theme of THEMES) {
      group = theme.name;
      for (const viewport of VIEWPORTS) {
        await auditViewport(browser, baseUrl, theme, viewport, state);
      }
      await auditWithoutScripts(browser, baseUrl, theme, state);
    }
    group = 'theme switcher';
    await checkThemeSwitcher(browser, baseUrl);
  } finally {
    await browser.close();
  }

  log('');
  log('Summary');
  for (const [name, entry] of tally) {
    const pages = entry.pages === 0 ? '' : `${String(entry.pages)} pages audited (${String(entry.violations)} violations, ${String(entry.scrolls)} horizontal scrolls, ${String(entry.wrongTheme)} in the wrong theme); `;
    log(`  ${`${name}:`.padEnd(16)} ${pages}${String(entry.checks)} checks, ${String(entry.failedChecks)} failed`);
  }

  log('');
  if (findings.length === 0) {
    log('Audit clean: no violation, no horizontal scroll, every page in its theme, every check passed.');

    return 0;
  }
  log(`Audit failed: ${String(findings.length)} page${findings.length === 1 ? '' : 's'}/check${findings.length === 1 ? '' : 's'} with findings.`);

  return 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof AuditError ? `\n${error.message}` : error);
    process.exitCode = 2;
  },
);
