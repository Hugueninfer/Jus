#!/usr/bin/env node
/**
 * Audits the pages the application really renders: axe-core (WCAG 2.0, 2.1 and 2.2, levels A and AA) and horizontal
 * scrolling at a desktop and a phone width, a keyboard pass with real key events on the filing page, and a pass with
 * JavaScript turned off (search, tabs and a whole filing through plain links and forms).
 *
 *   npm run audit:pages -- --base-url=http://127.0.0.1:8123
 *
 * It needs the application running with the demo data loaded (`composer setup`, `npm run build`, then
 * `php -S 127.0.0.1:<port> -t public` with `upload_max_filesize=10M` and `post_max_size=60M`) and signs in as the demo
 * lawyer. It drives the installed Google Chrome (no browser is downloaded). The audit files a few petitions in the demo
 * data, as a person would; `composer setup` puts the data back. It is not part of `composer ci` because it needs the
 * application running.
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

/** What went wrong, per page and width, for the report. */
const findings = [];

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

/** Audits the page in its current state; `label` is "page · state", `mode` the width and whether scripts run. */
async function auditPage(page, label, mode, { expectedStatus, status } = {}) {
  const [axeResults, scroll] = await Promise.all([runAxe(page), measureScroll(page)]);
  const violations = axeResults.violations.map(describeViolation);
  const overflow = scroll.scrollWidth > scroll.innerWidth;
  const statusWrong = expectedStatus !== undefined && status !== expectedStatus;
  const entry = { label, mode, violations, scroll, overflow, status, statusWrong, review: axeResults.incomplete.map(describeIncomplete) };

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

  const scrollText = `${String(axeResults.passes.length)} rules passed, scrollWidth ${String(scroll.scrollWidth)} <= ${String(scroll.innerWidth)}`;
  log(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${mode.padEnd(10)} ${label}${problems.length === 0 ? `  (0 violations, ${scrollText})` : `  <- ${problems.join('; ')}`}`);
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
  if (!passed) {
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
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('button[type="submit"]')]);
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

async function auditViewport(browser, baseUrl, viewport, state) {
  const mode = `${viewport.name} px`;
  log('');
  log(`== ${mode}, JavaScript on ==`);

  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  context.setDefaultTimeout(TIMEOUT_MS);
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

  if (viewport.name === '1280') {
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

  // The skip link is the first stop and takes the focus to the main content.
  await open(page, baseUrl, caseHref);
  await page.keyboard.press('Tab');
  const first = await activeElement(page);
  check('skip link: the first Tab stop is "Pular para o conteúdo"', first.tag === 'a' && first.label === 'Pular para o conteúdo', nameOf(first));
  await page.keyboard.press('Enter');
  const afterSkip = await activeElement(page);
  check('skip link: Enter moves the focus to main#conteudo', afterSkip.id === 'conteudo', nameOf(afterSkip));

  // The error summary after an empty submit.
  await open(page, baseUrl, `${caseHref}/peticionar`);
  const status = await submitEmptyFiling(page);
  check('filing: an empty submit answers 422', status === 422, String(status));

  const targets = await page.locator('#resumo-erros a').evaluateAll((links) => links.map((link) => link.getAttribute('href')?.slice(1) ?? ''));
  check('filing: the error summary links to the three fields', targets.join(',') === 'filing_type,filing_description,filing_files', targets.join(','));
  for (const target of targets) {
    await open(page, baseUrl, `${caseHref}/peticionar`);
    await submitEmptyFiling(page);
    await page.locator(`#resumo-erros a[href="#${target}"]`).focus();
    await page.keyboard.press('Enter');
    const focused = await activeElement(page);
    check(`filing: Enter on the summary link to #${target} moves the focus to the field`, focused.id === target, nameOf(focused));
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
    check(`filing: Tab reaches ${label}`, visited !== null, visited === null ? '' : visited.map(nameOf).join(' > '));
  }

  // The remove buttons, after choosing files.
  await open(page, baseUrl, `${caseHref}/peticionar`);
  await page.setInputFiles('#filing_files', await samplePdfs('primeiro.pdf', 'segundo.pdf'));
  await page.locator('#filing_files').focus();
  const toRemove = await tabTo(page, (element) => element.tag === 'button' && element.label.startsWith('Remover'), 4);
  check('filing: Tab goes from the file input to a "Remover" button', toRemove !== null, toRemove === null ? '' : toRemove.map(nameOf).join(' > '));
  if (toRemove !== null) {
    await page.keyboard.press('Enter');
    const afterRemoval = await activeElement(page);
    const remaining = await page.locator('jus-upload li').count();
    check('filing: Enter on "Remover" removes the file and keeps the focus on a "Remover" button', remaining === 1 && afterRemoval.label.startsWith('Remover'), `${String(remaining)} left, focus on ${nameOf(afterRemoval)}`);
    const next = await tabTo(page, (element) => element.tag === 'button' && element.type === 'submit', 3);
    check('filing: Tab then reaches the submit button', next !== null);
  }

  // Closing the confirmation of a filing from the keyboard keeps the focus near it.
  await open(page, baseUrl, `${caseHref}/peticionar`);
  await fillFiling(page, await samplePdfs('peticao-teclado.pdf'));
  await page.focus('form[data-jus-submit-once] button[type="submit"]');
  await Promise.all([page.waitForURL(/aba=movimentacoes/), page.keyboard.press('Enter')]);
  await page.waitForLoadState('load');
  const closeButton = page.locator('#andamento ~ .alert-success button.btn-close');
  check('filing: submitting with Enter lands on the case page with the confirmation', (await closeButton.count()) === 1);
  if ((await closeButton.count()) === 1) {
    await closeButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#andamento ~ .alert-success') === null);
    const landed = await activeElement(page);
    check('alert: closing the confirmation with Enter keeps the focus in the page (on #andamento, not at the top)', landed.id === 'andamento', nameOf(landed));
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
  // would take it for text. Unwrapping it keeps the styles that exist for the no-JS case in effect.
  const html = (await plain.content()).replace(/<\/?noscript[^>]*>/g, '');
  // The same matcher and handler that added the route remove it: unrouting by the URL would not find a route made with a function.
  const matches = (candidate) => candidate.href === url;
  const serve = (route) => route.fulfill({ status: status ?? 200, contentType: 'text/html; charset=utf-8', body: html });
  for (const view of views) {
    await view.page.route(matches, serve);
    try {
      await view.page.goto(url, { waitUntil: 'load' });
      await auditPage(view.page, label, `${view.name} px, as served`, { expectedStatus, status });
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
async function checkMenuInsideWindow(page) {
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
      `no JS, ${viewport.name} px: the main navigation links (${String(links.length)}) are inside the window`,
      links.length >= 3 && outside.length === 0,
      outside.join('; '),
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function auditWithoutScripts(browser, baseUrl, state) {
  const mode = 'no JS';
  log('');
  log(`== ${mode} (javaScriptEnabled: false, 1280 px; the served pages also at 375 px) ==`);

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  context.setDefaultTimeout(TIMEOUT_MS);
  const plain = await context.newPage();

  const views = [];
  for (const viewport of VIEWPORTS) {
    const viewContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    viewContext.setDefaultTimeout(TIMEOUT_MS);
    await viewContext.route('**/build/**/*.js', (route) => route.abort());
    views.push({ name: viewport.name, context: viewContext, page: await viewContext.newPage() });
  }

  let status = await open(plain, baseUrl, '/login');
  check('no JS: the sign-in page responds with its form', status === 200 && (await plain.locator('form button[type="submit"]').count()) === 1, String(status));
  await auditAsServed(plain, views, 'login (signed out)', { expectedStatus: 200, status });
  await signIn(plain, baseUrl);
  check('no JS: signing in with the plain form works', plain.url().includes('/processos'), plain.url());

  // Search: a plain GET form.
  status = await open(plain, baseUrl, '/processos');
  await auditAsServed(plain, views, 'search · results', { expectedStatus: 200, status });
  await checkMenuInsideWindow(plain);
  await plain.fill('#parte', 'zzzz-ninguem');
  await Promise.all([plain.waitForURL(/parte=zzzz/), plain.click('form[role="search"] button[type="submit"]')]);
  const empty = await plain.getByText('Nenhum processo encontrado.').count();
  check('no JS: the search form filters by party and says when nothing was found', empty > 0, plain.url());
  await auditAsServed(plain, views, 'search · no results');

  // Tabs: plain links.
  const caseHref = state.caseHref;
  status = await open(plain, baseUrl, caseHref);
  await auditAsServed(plain, views, 'case · Movimentações', { expectedStatus: 200, status });
  await Promise.all([plain.waitForURL(/aba=documentos/), plain.getByRole('link', { name: 'Documentos' }).click()]);
  check('no JS: the Documentos tab is a link and shows the documents table', (await plain.locator('table').count()) > 0, plain.url());
  await auditAsServed(plain, views, 'case · Documentos');
  await Promise.all([plain.waitForURL(/aba=movimentacoes/), plain.getByRole('link', { name: 'Movimentações' }).click()]);
  check('no JS: the Movimentações tab is a link and shows the timeline', (await plain.locator('.jus-timeline-event').count()) > 0, plain.url());

  // Filing: a plain multipart POST, the whole way.
  status = await open(plain, baseUrl, `${caseHref}/peticionar`);
  await auditAsServed(plain, views, 'filing · empty', { expectedStatus: 200, status });
  await fillFiling(plain, await samplePdfs('peticao-sem-js.pdf'));
  await Promise.all([plain.waitForURL(/aba=movimentacoes/), plain.click('form[data-jus-submit-once] button[type="submit"]')]);
  await plain.waitForLoadState('load');
  const confirmation = await plain.getByText('Petição juntada ao processo.').count();
  check('no JS: a whole filing succeeds and lands on the case page with the confirmation', confirmation > 0 && plain.url().includes('#andamento'), plain.url());
  await auditAsServed(plain, views, 'case · after a filing (confirmation)');

  status = await open(plain, baseUrl, '/design-system');
  await auditAsServed(plain, views, 'design system', { expectedStatus: 200, status });

  for (const view of views) {
    await view.context.close();
  }
  await context.close();
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
    for (const viewport of VIEWPORTS) {
      await auditViewport(browser, baseUrl, viewport, state);
    }
    await auditWithoutScripts(browser, baseUrl, state);
  } finally {
    await browser.close();
  }

  log('');
  if (findings.length === 0) {
    log('Audit clean: no violation, no horizontal scroll, every check passed.');

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
