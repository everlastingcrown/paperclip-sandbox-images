import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { chromium } from './node_modules/playwright/index.mjs';

const server = spawn(
  'serve',
  ['--listen', 'tcp://127.0.0.1:18474', '--no-clipboard', 'exports'],
  { stdio: 'inherit' },
);
const stopped = new Promise((resolve, reject) => {
  server.once('exit', resolve);
  server.once('error', reject);
});
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await globalThis.fetch('http://127.0.0.1:18474');
      assert.equal(response.status, 200);
      await response.text();
      break;
    } catch (error) {
      if (attempt === 49) throw error;
      await setTimeout(100);
    }
  }
  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:18474');
  await page.waitForFunction(() => globalThis.godotSmokeReady === true);
  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 120, y: 60 } });
  await page.waitForFunction(() => globalThis.godotSmokeClicked === true);
  const screenshot = await canvas.screenshot({ path: 'chromium-smoke.png' });
  assert.ok(screenshot.length > 1000, 'Expected a rendered game screenshot');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await stopped;
}
