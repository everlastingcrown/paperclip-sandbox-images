import assert from 'node:assert/strict';
import { log } from 'node:console';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import serveHandler from './node_modules/serve-handler/src/index.js';
import { chromium } from './node_modules/playwright/index.mjs';

// BuildKit can run harness variants in the same network namespace. Let the OS
// allocate a port and use this server's address rather than probing a shared one.
const server = createServer((request, response) =>
  serveHandler(request, response, { public: resolve('exports') }),
);
let browser;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  log(`Godot browser smoke listening on ${url}`);
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
  await page.goto(url);
  await page.waitForFunction(() => globalThis.godotSmokeReady === true);
  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 120, y: 60 } });
  await page.waitForFunction(() => globalThis.godotSmokeClicked === true);
  const screenshot = await canvas.screenshot({ path: 'chromium-smoke.png' });
  assert.ok(screenshot.length > 1000, 'Expected a rendered game screenshot');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
