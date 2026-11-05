import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = '.local/qa';
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

try {
  await visit('/');
  await assertText(page.getByRole('heading', { level: 1 }), 'Production overview');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '1,008');
  check('Overview renders synthetic summary');

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

  const table = page.getByRole('table', { name: 'Recently finished units' });
  await page.getByLabel('Activity model').selectOption('OSX-100');
  assert.ok((await table.locator('tbody').innerText()).includes('OSX-100'));
  assert.ok(!(await table.locator('tbody').innerText()).includes('OSX-150'));
  await page.getByLabel('Activity model').selectOption('All models');
  await page.getByLabel('Activity station').selectOption('St 2');
  assert.ok(!(await table.locator('tbody').innerText()).includes('St 1'));
  await page.getByLabel('Activity station').selectOption('All stations');
  await page.getByRole('button', { name: 'Unit', exact: true }).click();
  assert.equal(await table.locator('th').first().getAttribute('aria-sort'), 'ascending');
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('missing');
  await assertText(page.getByRole('status').filter({ hasText: 'No synthetic' }), 'No synthetic units');
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('DEMO-18793');
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
  check('Unit wavelength control, lookup empty state, and example recovery');

  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Failures & replacements' }).click();
  await page.getByRole('button', { name: '24 ch', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '24 ch', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.ok((await page.getByRole('img', { name: /^Histogram of failed/ }).getAttribute('aria-label')).includes('24-channel'));
  check('Failures navigation and channel-count histogram');

  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Query console' }).click();
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await page.locator('.recharts-surface').waitFor();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: /TBL UNITS/ }).click();
  assert.equal(await page.getByRole('button', { name: /TBL UNITS/ }).getAttribute('aria-expanded'), 'true');
  await page.getByRole('searchbox', { name: 'Search queries' }).fill('Retest');
  assert.equal(await page.locator('.q-btn').filter({ hasText: 'Channels tested by period' }).count(), 0);
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
        await visit(route);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1);
        const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
        assert.ok(dimensions.content <= dimensions.width + 1, `Page overflow ${route} at ${width}: ${dimensions.content}`);
        await page.screenshot({ path: `${output}/${theme}-${width}-${route.slice(1) || 'overview'}.png`, fullPage: true });
      }
    }
  }
  check('All four screens fit desktop, tablet, and narrow widths in both themes (24 screenshots)');

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

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  check('No console errors, page errors, missing assets, or failed requests');
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ base, checks, errors }, null, 2));
} finally {
  await browser.close();
}
