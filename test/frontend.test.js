import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { generateStyling } from '../src/styling.js';

test('frontend displays binary AI output, regenerates from the original, preserves previous results on failure, and downloads JPEG', async () => {
  const png = await sharp({ create: { width: 4, height: 6, channels: 3, background: 'white' } }).png().toBuffer();
  const app = createApp({ styleImage: args => generateStyling(args, { apiKey: 'fixture-key', fetchImpl: async () => Response.json({ data: [{ b64_json: png.toString('base64') }] }) }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const elements = new Map(), requests = [];
  let fail = false, saved;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      src: `${base}/example.jpg`, value: '', hidden: true, disabled: false, style: {}, attrs: {}, handlers: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(type, callback) { this.handlers[type] = callback; },
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    });
    return elements.get(id);
  }
  const document = {
    getElementById: element, querySelector: element,
    querySelectorAll: selector => selector.includes('#generate') ? ['photo','sample','prompt','generate','regenerate','download'].map(element) : [],
    createElement: () => ({ click() { saved = this.download; }, remove() {} }), body: { append() {} },
  };
  const context = vm.createContext({
    document, URL, File, FormData, AbortSignal, location: { href: base },
    Image: class { async decode() {} }, setTimeout: callback => callback(),
    fetch: async (url, options) => {
      if (url.startsWith('blob:')) return fetch(url, options);
      if (options?.body) {
        const body = options.body;
        requests.push({ image: Buffer.from(await body.get('image').arrayBuffer()), style: body.get('style'), prompt: body.get('prompt') });
      }
      if (fail) return Response.json({ error: { message: 'Actionable editing failure' } }, { status: 502 });
      return fetch(new URL(url, base), options);
    },
    originalFile: new File([png], 'original.png', { type: 'image/png' }),
  });
  try {
    const code = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
    vm.runInContext(code.replace('export const config', 'const config'), context);
    vm.runInContext("photoFile = originalFile; selectedStyle = 'business'", context);
    element('prompt').value = 'navy jacket';
    await element('generate').handlers.click();
    assert.match(element('result').src, /^blob:/);
    assert.equal(element('download').disabled, false);
    assert.equal(element('regenerate').hidden, false);
    vm.runInContext("selectedStyle = 'vintage'", context);
    await element('regenerate').handlers.click();
    assert.equal(requests.length, 2);
    for (const request of requests) { assert.deepEqual(request.image, png); assert.equal(request.prompt, 'navy jacket'); }
    assert.deepEqual(requests.map(request => request.style), ['business', 'vintage']);
    const previous = element('result').src;
    fail = true; await element('regenerate').handlers.click();
    assert.equal(element('result').src, previous);
    assert.equal(element('notice').textContent, 'Actionable editing failure');
    assert.equal(element('progress').hidden, true);
    assert.equal(element('generate').disabled, false);
    assert.equal(element('download').disabled, false);
    await element('download').handlers.click();
    assert.equal(saved, 'forme-vintage.jpg');
    vm.runInContext('resetResult()', context);
    assert.equal(element('download').disabled, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
