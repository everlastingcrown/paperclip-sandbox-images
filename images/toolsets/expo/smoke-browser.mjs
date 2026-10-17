import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { chromium } from './node_modules/playwright/index.mjs';

await writeFile(
  'index.html',
  "<button onclick=\"document.querySelector('output').textContent='1'\">Increment</button><output>0</output>",
);
const server = spawn(
  'serve',
  ['--listen', 'tcp://127.0.0.1:4173', '--no-clipboard', '.'],
  {
    stdio: 'inherit',
  },
);
const stopped = new Promise((resolve, reject) => {
  server.once('exit', resolve);
  server.once('error', reject);
});
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await globalThis.fetch('http://127.0.0.1:4173');
      assert.equal(response.status, 200);
      await response.text();
      break;
    } catch (error) {
      if (attempt === 49) throw error;
      await setTimeout(100);
    }
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button').click();
  assert.equal(await page.locator('output').textContent(), '1');
  await page.screenshot({ path: 'chromium-smoke.png' });
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await stopped;
}
