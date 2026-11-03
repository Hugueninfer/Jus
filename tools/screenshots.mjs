#!/usr/bin/env node
/**
 * Captures the screenshots the README shows (docs/screenshots/*.png), in the light theme: the sign-in page, the search, a
 * case page (and, on the desktop, its timeline), the filing form and the design system catalogue, at a desktop and a phone
 * viewport; and in the dark theme (`*-escuro.png`): the sign-in page, the search, the case page, the filing form and the
 * catalogue, at the desktop viewport.
 *
 *   npm run screenshots -- --base-url=http://127.0.0.1:8123
 *
 * It needs the application running with the demo data loaded (`composer setup`, `npm run build`, then
 * `php -S 127.0.0.1:<port> -t public`) and signs in as the demo lawyer. It drives the installed Google Chrome (no browser is
 * downloaded) and captures the viewport only, which keeps each PNG small (it fails above 300 KB). The theme is the
 * `jus_tema` cookie, set on the browser before the first page, as if the person had chosen it; a page that does not come in
 * that theme stops the capture. Nothing is filed: the filing form is filled in but never submitted, so the demo data stays
 * as it was. The deadlines on the pages are relative to today, so they differ from run to run.
 *
 * It refuses a `--base-url` that is not on this machine (localhost, 127.x.x.x, [::1]) unless `--allow-remote` is passed,
 * since it signs in with the demo account.
 *
 * The exit code is 1 when the capture could not be done (the server is not reachable, the demo account cannot sign in, a
 * page in the wrong theme, a wrong argument) or a screenshot is above the size budget.
 */
import { mkdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from 'playwright';

const OUTPUT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const SAMPLE_PDF = fileURLToPath(new URL('../tests/fixtures/sample.pdf', import.meta.url));

const DEMO_USER = { email: 'advogado@jus.test', password: 'jus-demo' };
const TIMEOUT_MS = 15_000;
const DESKTOP = { suffix: 'desktop', width: 1280, height: 800 };
const PHONE = { suffix: 'celular', width: 375, height: 812 };
const MAX_BYTES = 300 * 1024;

/** The value of the cookie, what the page must then carry on <html>, and the suffix of the file names. */
const THEME_COOKIE = 'jus_tema';
const LIGHT = { cookie: 'claro', bootstrapTheme: 'light', colorScheme: 'light', suffix: '' };
const DARK = { cookie: 'escuro', bootstrapTheme: 'dark', colorScheme: 'dark', suffix: '-escuro' };

const USAGE = 'Usage: npm run screenshots -- --base-url=http://127.0.0.1:8000 [--allow-remote]';

/** The capture could not run: the message says what to do, no stack needed. */
class CaptureError extends Error {}

function log(text = '') {
  console.log(text);
}

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
      throw new CaptureError(`Unknown argument "${argument}". ${USAGE}`);
    } else {
      options.baseUrl = match[1].replace(/\/+$/, '');
    }
  }

  let url;
  try {
    url = new URL(options.baseUrl);
  } catch {
    throw new CaptureError(`"${options.baseUrl}" is not a URL. ${USAGE}`);
  }
  if (!isLoopback(url.hostname) && !options.allowRemote) {
    throw new CaptureError(
      `Refusing to use ${url.origin}: it is not on this machine, and the capture signs in with the demo account. ` +
        'Pass --allow-remote if that server is yours to use.',
    );
  }

  return options;
}

/** The capture drives the Google Chrome installed on this machine; without it Playwright's own message is a long stack. */
async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
    throw new CaptureError(`Could not start Google Chrome (${reason}). Install Google Chrome: the capture uses the installed browser and downloads none.`);
  }
}

async function open(page, baseUrl, path) {
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'load' });
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
    throw new CaptureError(`Could not open ${baseUrl}${path} (${reason}). Is the application running at that address?`);
  }
}

async function signIn(page, baseUrl) {
  await open(page, baseUrl, '/login');
  await page.fill('#username', DEMO_USER.email);
  await page.fill('#password', DEMO_USER.password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('form[action$="/login"] button[type="submit"]')]);
  if (!new URL(page.url()).pathname.startsWith('/processos')) {
    throw new CaptureError(
      `Signing in as ${DEMO_USER.email} did not work (the browser ended on ${page.url()}). Is the demo data missing? Run "composer setup".`,
    );
  }
}

/**
 * The first case in the search results where the demo lawyer can file (the page offers "Peticionar") and that has a deadline
 * still open, so the case page shows a coloured deadline badge.
 */
async function findShowcaseCase(page, baseUrl) {
  await open(page, baseUrl, '/processos');
  const hrefs = await page.locator('.jus-case-list a.stretched-link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  for (const href of hrefs) {
    await open(page, baseUrl, href);
    const canFile = (await page.locator('a.btn-primary[href$="/peticionar"]').count()) > 0;
    const hasOpenDeadline = (await page.locator('[data-urgency]:not([data-urgency="fulfilled"])').count()) > 0;
    if (canFile && hasOpenDeadline) {
      return href;
    }
  }
  throw new CaptureError('No case in the search results lets the demo lawyer file a petition and has an open deadline. Is the demo data missing? Run "composer setup".');
}

/** Waits until the page looks final: fonts loaded and the Web Components defined (they upgrade after the page loads). */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      ['jus-numero-processo', 'jus-filtro-timeline', 'jus-upload']
        .filter((name) => document.querySelector(name) !== null)
        .map((name) => customElements.whenDefined(name)),
    );
  });
}

/** The focus ring of the last field touched (or of the field the page focuses itself) is not what the screenshot is about. */
async function blurFocus(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

/** Fills the filing form the way a person would, without sending it: the screenshot shows the chosen file in the list. */
async function fillFilingForm(page) {
  const buffer = await readFile(SAMPLE_PDF);
  await page.selectOption('#filing_type', { label: 'Manifestação' });
  await page.fill('#filing_description', 'Manifestação sobre a decisão que indeferiu a tutela de urgência, com o documento em anexo.');
  await page.setInputFiles('#filing_files', [{ name: 'manifestacao.pdf', mimeType: 'application/pdf', buffer }]);
  await blurFocus(page);
}

async function captureAs(page, name, viewport, theme, files) {
  await settle(page);
  const shown = await page.locator('html').getAttribute('data-bs-theme');
  if (shown !== theme.bootstrapTheme) {
    throw new CaptureError(`${page.url()} came with data-bs-theme="${String(shown)}", not "${theme.bootstrapTheme}": the ${THEME_COOKIE} cookie did not take effect.`);
  }
  const fileName = `${name}-${viewport.suffix}${theme.suffix}.png`;
  await page.screenshot({ path: `${OUTPUT_DIR}${fileName}`, animations: 'disabled', caret: 'hide' });
  const { size } = await stat(`${OUTPUT_DIR}${fileName}`);
  files.push({ fileName, size });
  log(`${size > MAX_BYTES ? 'BIG ' : 'ok  '} ${fileName.padEnd(36)} ${String(viewport.width)}x${String(viewport.height)}, ${theme.bootstrapTheme}, ${String(Math.round(size / 1024))} KB`);
}

async function captureViewport(browser, baseUrl, viewport, theme, state, shots, files) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: 'pt-BR', colorScheme: theme.colorScheme });
  context.setDefaultTimeout(TIMEOUT_MS);
  await context.addCookies([{ name: THEME_COOKIE, value: theme.cookie, url: baseUrl }]);
  const capture = (page, name) => captureAs(page, name, viewport, theme, files);
  try {
    const page = await context.newPage();
    if (shots.has('login')) {
      await open(page, baseUrl, '/login');
      // The e-mail field takes the focus as the page loads.
      await blurFocus(page);
      await capture(page, 'login');
    }
    await signIn(page, baseUrl);
    state.caseHref ??= await findShowcaseCase(page, baseUrl);

    if (shots.has('busca')) {
      await open(page, baseUrl, '/processos');
      await capture(page, 'busca');
    }
    if (shots.has('processo')) {
      await open(page, baseUrl, `${state.caseHref}?aba=movimentacoes`);
      await capture(page, 'processo');
      if (shots.has('andamento')) {
        // The timeline and its filter by type are further down the page than the first screen.
        await page.evaluate(() => {
          document.querySelector('#andamento')?.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
        await capture(page, 'processo-andamento');
      }
    }
    if (shots.has('peticionar')) {
      await open(page, baseUrl, `${state.caseHref}/peticionar`);
      await fillFilingForm(page);
      await capture(page, 'peticionar');
    }
    if (shots.has('catalogo')) {
      await open(page, baseUrl, '/design-system');
      await capture(page, 'catalogo');
    }
  } finally {
    await context.close();
  }
}

async function main() {
  const { baseUrl } = parseArguments(process.argv.slice(2));
  log(`Jus screenshots — ${baseUrl} -> docs/screenshots/`);
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await launchChrome();
  const state = {};
  const files = [];
  try {
    await captureViewport(browser, baseUrl, DESKTOP, LIGHT, state, new Set(['login', 'busca', 'processo', 'andamento', 'peticionar', 'catalogo']), files);
    await captureViewport(browser, baseUrl, PHONE, LIGHT, state, new Set(['busca', 'processo']), files);
    await captureViewport(browser, baseUrl, DESKTOP, DARK, state, new Set(['login', 'busca', 'processo', 'peticionar', 'catalogo']), files);
  } finally {
    await browser.close();
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);
  log(`${String(files.length)} screenshots, ${String(Math.round(total / 1024))} KB in all`);
  const big = files.filter((file) => file.size > MAX_BYTES);
  if (big.length > 0) {
    throw new CaptureError(`Above the budget of ${String(MAX_BYTES / 1024)} KB: ${big.map((file) => file.fileName).join(', ')}.`);
  }

  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof CaptureError ? `\n${error.message}` : error);
    process.exitCode = 1;
  },
);
