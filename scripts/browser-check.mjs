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
let runActivityMode = 'not_connected';
const runActivityRequests = [];
const configurationTimingRequests = [];
const purposeTotals = { production: 2, engineering: 3, training: 1, calibration: 4 };
const purposeOpenRuns = { production: 0, engineering: 1, training: 0, calibration: 0 };
const purposeConfirmed = { production: 1, engineering: 1, training: 0, calibration: 0 };
const sampleState = n => n === 0 ? 'no_data' : n < 10 ? 'small_sample' : 'ok';
const durationStatistics = (n, multiplier) => ({
  n,
  mean: n ? n * multiplier : null,
  median: n ? n * multiplier : null,
  p90: n ? n * multiplier + 10 : null,
  sample_state: sampleState(n),
});
const runActivityFixture = url => {
  const purpose = url.searchParams.get('purpose');
  const purposes = purpose ? [purpose] : Object.keys(purposeTotals);
  const byPurpose = Object.fromEntries(Object.keys(purposeTotals).map(key => [key, purposes.includes(key) ? purposeTotals[key] : 0]));
  const total = Object.values(byPurpose).reduce((sum, count) => sum + count, 0);
  const openRuns = purposes.reduce((sum, key) => sum + purposeOpenRuns[key], 0);
  const confirmed = purposes.reduce((sum, key) => sum + purposeConfirmed[key], 0);
  const unavailable = total - openRuns - confirmed;
  const ended = total - openRuns;
  return {
    data_source: 'test_database',
    tls: 'encrypted_unverified',
    window: {
      started_from: new Date(url.searchParams.get('started_from')).toISOString().replace('.000Z', 'Z'),
      started_before: new Date(url.searchParams.get('started_before')).toISOString().replace('.000Z', 'Z'),
    },
    filters: { purpose, wavelength_mode: null, switch_model: null },
    incomplete: false,
    runs: {
      count_basis: 'runs_started_in_window_not_units',
      total,
      by_run_purpose: byPurpose,
      by_completion_status: { in_progress: openRuns, complete: total - openRuns, stopped: 0, failed: 0 },
    },
    timing: {
      open_runs: openRuns,
      by_quality: { confirmed, checkpoint_estimate: 0, partial: 0, provisional: 0, unavailable },
      active_seconds: durationStatistics(confirmed, 50),
      elapsed_seconds: durationStatistics(ended, 80),
      stopped_seconds: { n: confirmed, mean: confirmed ? 15 : null, sample_state: sampleState(confirmed) },
      flagged_over_90_min: 0,
    },
  };
};
const configurationTimingFixture = url => {
  const purpose = url.searchParams.get('purpose');
  const runs = purpose ? purposeTotals[purpose] : Object.values(purposeTotals).reduce((sum, count) => sum + count, 0);
  const confirmed = purpose ? purposeConfirmed[purpose] : Object.values(purposeConfirmed).reduce((sum, count) => sum + count, 0);
  const openRuns = purpose ? purposeOpenRuns[purpose] : Object.values(purposeOpenRuns).reduce((sum, count) => sum + count, 0);
  const ended = runs - openRuns;
  return {
    data_source: 'test_database',
    tls: 'encrypted_unverified',
    window: {
      started_from: new Date(url.searchParams.get('started_from')).toISOString().replace('.000Z', 'Z'),
      started_before: new Date(url.searchParams.get('started_before')).toISOString().replace('.000Z', 'Z'),
    },
    filters: { purpose, wavelength_mode: null },
    incomplete: false,
    configurations: [{
      switch_model: 'OSX-150',
      wavelength_mode: 'SM',
      front_panel_channel_count: 48,
      runs: ended,
      open_runs: openRuns,
      elapsed_seconds: durationStatistics(ended, 80),
      active_seconds: durationStatistics(confirmed, 50),
      confirmed_timing_runs: confirmed,
      unavailable_timing_runs: ended - confirmed,
      seconds_per_channel: ended ? ended * 80 / 48 : null,
      flagged_over_90_min: 0,
    }],
  };
};
await page.route('**/api/v1/reporting/run-activity?*', async route => {
  const url = new URL(route.request().url());
  runActivityRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : runActivityFixture(url)),
  });
});
await page.route('**/api/v1/reporting/test-time-by-configuration?*', async route => {
  const url = new URL(route.request().url());
  configurationTimingRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : configurationTimingFixture(url)),
  });
});
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
page.on('requestfailed', request => {
  const pathname = new URL(request.url()).pathname;
  const expectedUnmountCancellation = ['/api/v1/reporting/run-activity', '/api/v1/reporting/test-time-by-configuration'].includes(pathname) && request.failure()?.errorText === 'net::ERR_ABORTED';
  if (!expectedUnmountCancellation) errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`);
});
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

  const liveCard = page.getByRole('region', { name: 'Run activity' });
  await liveCard.getByText('Live data is off. Start the backend with reporting settings to see test-database numbers.').first().waitFor();
  assert.equal(await liveCard.getByText('Live data is off. Start the backend with reporting settings to see test-database numbers.').count(), 2);
  const firstLiveRequest = runActivityRequests.find(url => url.searchParams.get('purpose') === 'production');
  assert.ok(firstLiveRequest);
  const startedFrom = new Date(firstLiveRequest.searchParams.get('started_from'));
  const startedBefore = new Date(firstLiveRequest.searchParams.get('started_before'));
  assert.equal(startedBefore.getTime() - startedFrom.getTime(), 30 * 24 * 60 * 60 * 1000);
  assert.equal(startedBefore.toISOString().slice(11), '00:00:00.000Z');
  assert.equal(firstLiveRequest.searchParams.get('purpose'), 'production');
  check('Live card not-connected state and 30 complete UTC day request window');

  const downPage = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await downPage.route('**/api/v1/reporting/run-activity?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/test-time-by-configuration?*', route => route.abort('connectionrefused'));
  try {
    await downPage.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await downPage.getByRole('region', { name: 'Run activity' }).getByText('Backend not reachable on 127.0.0.1:8000').first().waitFor();
    check('Live card backend-down state');
  } finally { await downPage.close(); }

  runActivityMode = 'connected';
  await liveCard.getByRole('button', { name: 'Refresh live data' }).click();
  await liveCard.getByText('Raw run activity, not units').waitFor();
  await assertText(liveCard, 'Encrypted, certificate not verified');
  await liveCard.getByText('Runs started').locator('..').getByText('2', { exact: true }).waitFor();
  await assertText(liveCard, 'Small sample');
  const liveConfigurationTable = liveCard.getByRole('table', { name: 'Live test time by configuration' });
  await liveConfigurationTable.getByText('OSX-150').waitFor();
  await assertText(liveConfigurationTable, '48 ch');
  await assertText(liveConfigurationTable, '1 / 2 confirmed');
  assert.equal(configurationTimingRequests.at(-1).searchParams.get('purpose'), 'production');
  await assertText(page.getByRole('button', { name: /^Engineering / }), '3');
  assert.ok((await page.getByRole('button', { name: /^Engineering / }).innerText()).includes('3'));
  check('Live card connected counts, configuration timing, samples, TLS, and live purpose-chip counts');

  await page.reload();
  await page.locator('h1').waitFor();
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
  await liveCard.getByText('Runs started').locator('..').getByText('5', { exact: true }).waitFor();
  await liveCard.getByText('Select one purpose or all to see timing').waitFor();
  await liveCard.getByText('Select one purpose or all to see times by configuration').waitFor();
  await page.getByRole('button', { name: /^Training / }).click();
  await page.getByRole('button', { name: /^Calibration / }).click();
  await liveCard.getByText('Runs started').locator('..').getByText('10', { exact: true }).waitFor();
  await liveCard.getByText('Elapsed time').waitFor();
  assert.equal(runActivityRequests.at(-1).searchParams.has('purpose'), false);
  assert.equal(configurationTimingRequests.at(-1).searchParams.has('purpose'), false);
  check('Live counts combine across selected purposes; timing is refused for partial combinations and restored for all-purpose request');
  await page.getByRole('button', { name: 'Back to production only' }).click();
  await liveCard.getByText('Runs started').locator('..').getByText('2', { exact: true }).waitFor();
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
