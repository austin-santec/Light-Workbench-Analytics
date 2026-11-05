import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.QA_OUTPUT || '.local/qa';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH, headless: true } : { channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
page.on('requestfailed', request => errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
const check = label => { checks.push(label); console.log(`PASS ${label}`); };
const visit = async route => { await page.goto(`${base}/#${route}`); await page.locator('h1').waitFor(); };
const assertText = async (locator, text) => assert.ok((await locator.innerText()).includes(text), `Expected ${text}`);
const assertFocus = async locator => assert.ok(await locator.evaluate(element => element === document.activeElement), 'Expected keyboard focus');
const assertFocusRing = async locator => {
  const ring = await locator.evaluate(element => { const s = getComputedStyle(element); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
  assert.ok(ring.style !== 'none' && ring.width >= 2, 'Expected a visible focus outline');
};
function contrast(first, second) {
  const luminance = color => {
    const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const n = color.startsWith('color(srgb') ? value : value / 255;
      return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
    });
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

try {
  await visit('/');
  await assertText(page.getByRole('heading', { level: 1 }), 'Production overview');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '1,008');
  check('Overview renders synthetic summary');

  await page.keyboard.press('Tab');
  await assertFocus(page.getByRole('link', { name: 'Skip to content' }));
  await page.keyboard.press('Enter');
  await assertFocus(page.locator('main'));
  const fixedTrend = await page.getByRole('img', { name: /^Line chart of daily/ }).locator('path').last().getAttribute('d');

  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '8,184');
  await page.getByRole('button', { name: /^Engineering / }).click();
  await assertText(page.getByRole('heading', { level: 1 }), 'Production + engineering');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '8,736');
  await page.getByRole('button', { name: 'Back to production only' }).click();
  await page.getByRole('button', { name: /^Production / }).click();
  assert.equal(await page.getByRole('button', { name: /^Production / }).getAttribute('aria-pressed'), 'true');
  check('Range and purpose filters update summary; final purpose cannot be deselected');

  await page.getByRole('button', { name: /OSX-150 SM 36 ch/ }).click();
  assert.ok((await page.getByRole('img', { name: /^Histogram of/ }).getAttribute('aria-label')).includes('36 channels'));
  check('Configuration selection updates histogram');
  assert.equal(await page.getByRole('img', { name: /^Line chart of daily/ }).locator('path').last().getAttribute('d'), fixedTrend);
  await page.getByRole('button', { name: 'Yesterday', exact: true }).focus();
  await page.keyboard.press('Space');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '2,520');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '8,184');
  check('Skip link, keyboard range selection, visible focus, and fixed historical trend scope');

  const table = page.getByRole('table', { name: 'Recently finished units' });
  await page.getByLabel('Activity model').selectOption('OSX-100');
  assert.ok((await table.locator('tbody').innerText()).includes('OSX-100'));
  assert.ok(!(await table.locator('tbody').innerText()).includes('OSX-150'));
  await page.getByLabel('Activity model').selectOption({ label: 'All models' });
  await page.getByLabel('Activity station').selectOption('St 2');
  assert.ok(!(await table.locator('tbody').innerText()).includes('St 1'));
  await page.getByLabel('Activity station').selectOption({ label: 'All stations' });
  await page.getByRole('button', { name: 'Unit', exact: true }).click();
  assert.equal(await table.locator('th').first().getAttribute('aria-sort'), 'ascending');
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('missing');
  await assertText(page.getByRole('status').filter({ hasText: 'No synthetic' }), 'No synthetic units');
  await page.getByRole('button', { name: 'Reset activity filters' }).focus();
  await page.keyboard.press('Enter');
  await assertFocus(page.getByRole('searchbox', { name: 'Find a unit' }));
  assert.equal(await table.locator('tbody tr').count(), 8);
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('  demo-18793  ');
  assert.equal(await table.locator('tbody tr').count(), 1);
  await table.getByRole('link', { name: 'DEMO-18793' }).click();
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  check('Activity search, model/station filters, sort, empty state, and matching detail link');

  await page.getByRole('button', { name: '1310 nm', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '1310 nm', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('searchbox', { name: 'Look up a unit' }).fill('NO-FIXTURE');
  await page.getByRole('heading', { name: 'No unit fixture found' }).waitFor();
  await page.getByRole('button', { name: 'Load example unit' }).click();
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  await assertFocus(page.getByRole('searchbox', { name: 'Look up a unit' }));
  await page.getByRole('searchbox', { name: 'Look up a unit' }).fill('  demo-sw-001  ');
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  check('Unit wavelength control, lookup empty state, and example recovery');

  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Failures & replacements' }).click();
  await page.getByRole('button', { name: '24 ch', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '24 ch', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.ok((await page.getByRole('img', { name: /^Histogram of failed/ }).getAttribute('aria-label')).includes('24-channel'));
  check('Failures navigation and channel-count histogram');
  assert.ok(await page.getByRole('button', { name: 'Open all in console', exact: true }).isDisabled());

  const unitLink = page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Unit lookup' });
  await unitLink.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  await assertFocus(page.locator('main'));
  await page.goBack();
  await page.getByRole('heading', { name: 'Failures & replacements', exact: true }).waitFor();
  await assertFocus(page.locator('main'));
  check('Keyboard navigation and browser-back restore focus to the page frame');

  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Query console' }).click();
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await page.locator('.recharts-surface').waitFor();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: /TBL UNITS/ }).click();
  assert.equal(await page.getByRole('button', { name: /TBL UNITS/ }).getAttribute('aria-expanded'), 'true');
  await page.getByRole('searchbox', { name: 'Search queries' }).fill('  rEtEsT  ');
  assert.equal(await page.locator('.q-btn').filter({ hasText: 'Channels tested by period' }).count(), 0);
  assert.equal(await page.locator('.q-btn').filter({ hasText: 'Retests by operator' }).count(), 1);
  await page.getByRole('searchbox', { name: 'Search queries' }).fill('NO-QUERY-FIXTURE');
  await assertText(page.getByRole('status'), 'No query titles match');
  await page.getByRole('searchbox', { name: 'Search queries' }).fill('');
  assert.ok(await page.getByRole('button', { name: 'Run Ctrl ↵', exact: true }).isDisabled());
  check('Query chart/table tabs, illustrative schema, library search, and disabled SQL execution');

  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Light mode', exact: true }).waitFor();
  check('Theme persists on reload');

  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Light mode', exact: true }).click();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const route of ['/', '/failures', '/unit', '/queries']) {
        await page.goto('about:blank');
        await visit(route);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1);
        const active = page.getByRole('navigation', { name: 'Main', exact: true }).locator('[aria-current="page"]');
        assert.equal(await active.count(), 1);
        assert.equal(await active.getAttribute('href'), `#${route}`);
        assert.ok((await page.title()).includes('Light Workbench Analytics'));
        assert.equal(await page.locator('main').count(), 1);
        assert.equal(await page.locator('#preview-help').count(), 1);
        assert.ok((await page.locator('#preview-help').innerText()).includes('previews'));
        assert.ok(await page.locator('.preview-control').evaluateAll(elements => elements.every(element => element.disabled && element.getAttribute('aria-describedby') === 'preview-help')));
        const colorPairs = await page.evaluate(() => {
          const nav = document.querySelector('.main-navigation [aria-current="page"]');
          const frame = document.querySelector('.page-frame');
          const probe = document.createElement('span');
          probe.style.color = 'var(--muted)'; frame.append(probe);
          const muted = getComputedStyle(probe).color; probe.remove();
          return { navText: getComputedStyle(nav).color, navBackground: getComputedStyle(nav).backgroundColor, muted, background: getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('--panel').trim() };
        });
        assert.ok(contrast(colorPairs.navText, colorPairs.navBackground) >= 4.5, `Navigation contrast ${theme}`);
        // Resolve the palette hex value to rgb for the text contrast calculation.
        const panelRgb = await page.evaluate(color => { const el = document.createElement('span'); el.style.color = color; document.body.append(el); const rgb = getComputedStyle(el).color; el.remove(); return rgb; }, colorPairs.background);
        assert.ok(contrast(colorPairs.muted, panelRgb) >= 4.5, `Muted text contrast ${theme}`);
        const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
        assert.ok(dimensions.content <= dimensions.width + 1, `Page overflow ${route} at ${width}: ${dimensions.content}`);
        await page.screenshot({ path: `${output}/${theme}-${width}-${route.slice(1) || 'overview'}.png`, fullPage: true });
        const control = route === '/' ? page.getByRole('button', { name: 'This week', exact: true })
          : route === '/failures' ? page.getByRole('button', { name: '24 ch', exact: true })
          : route === '/unit' ? page.getByRole('searchbox', { name: 'Look up a unit' })
          : page.getByRole('searchbox', { name: 'Search queries' });
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter'); // Skip link focuses the common page frame.
        await assertFocus(page.locator('main'));
        await control.focus();
        await assertFocusRing(control);
        if (route === '/' || route === '/failures') {
          await page.keyboard.press('Space');
          assert.equal(await control.getAttribute('aria-pressed'), 'true');
        } else if (route === '/unit') {
          await page.keyboard.press('ControlOrMeta+A');
          await page.keyboard.type('demo-sw-001');
          await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
        } else {
          await page.keyboard.type('does-not-exist');
          await assertText(page.getByRole('status'), 'No query titles match');
        }
      }
    }
  }
  check('All four screens: direct routes, active navigation, keyboard focus, preview states, contrast, and responsive layout in both themes (24 screenshots)');

  await visit('/queries');
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await page.locator('.recharts-surface').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${output}/light-390-query-chart.png`, fullPage: true });
  await visit('/unit?serial=DEMO-18804');
  await page.getByRole('heading', { name: 'No unit fixture found' }).waitFor();
  await visit('/unknown');
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  check('Narrow query chart, unsupported unit deep link, and unknown route');

  // Isolate deliberate failed/delayed imports from the normal no-error diagnostics.
  const recoveryPage = await browser.newPage();
  let releaseImport;
  const importGate = new Promise(resolve => { releaseImport = resolve; });
  let simulateFailure = false;
  let intercepted = false;
  await recoveryPage.route('**/*', async request => {
    const pathname = new URL(request.request().url()).pathname;
    if (pathname === '/src/screens/Unit.tsx' || /\/assets\/Unit-[^/]+\.js$/.test(pathname)) {
      intercepted = true;
      await importGate;
      if (simulateFailure) { await request.fulfill({ status: 503, contentType: 'text/javascript', body: '// Deliberate browser-test failure' }); return; }
    }
    await request.continue();
  });
  try {
    await recoveryPage.goto(`${base}/#/unit`, { waitUntil: 'domcontentloaded' });
    await recoveryPage.getByRole('status').filter({ hasText: 'Loading demo screen' }).waitFor();
    assert.ok(await recoveryPage.getByRole('navigation', { name: 'Main', exact: true }).isVisible());
    assert.ok(intercepted);
    simulateFailure = true;
    releaseImport();
    await recoveryPage.getByRole('heading', { name: 'Unable to load this screen' }).waitFor();
    await recoveryPage.unrouteAll({ behavior: 'wait' });
    await recoveryPage.getByRole('button', { name: 'Reload screen' }).click();
    await recoveryPage.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
    check('Delayed route shows loading state; simulated import failure shows recovery UI and reload succeeds');
  } finally { releaseImport(); await recoveryPage.close(); }

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  check('No console errors, page errors, missing assets, or failed requests in normal flows');
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ base, checks, errors }, null, 2));
} finally {
  await browser.close();
}
