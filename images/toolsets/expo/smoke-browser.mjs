import assert from 'node:assert/strict';
import { log } from 'node:console';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import serveHandler from './node_modules/serve-handler/src/index.js';
import { chromium } from './node_modules/playwright/index.mjs';

await writeFile(
  'index.html',
  "<button onclick=\"document.querySelector('output').textContent='1'\">Increment</button><output>0</output>",
);
// BuildKit may run independent toolsets in the same network namespace.
// Use this server's allocated port so each check reaches its own page.
const server = createServer((request, response) =>
  serveHandler(request, response, { public: resolve('.') }),
);
let browser;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  log(`Expo browser smoke listening on ${url}`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByRole('button').click();
  assert.equal(await page.locator('output').textContent(), '1');
  await page.screenshot({ path: 'chromium-smoke.png' });
} finally {
  await browser?.close();
  if (server.listening)
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
}
