import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { generateStyling } from '../src/styling.js';

let server, base, png;
before(async () => {
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).png().toBuffer();
  const app = createApp({ styleImage: args => generateStyling(args, {
    apiKey: 'test-only-key',
    fetchImpl: async () => Response.json({ data: [{ b64_json: png.toString('base64') }] }),
  }) });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
function form({ style = 'casual', prompt = 'neutral colors', bytes = png, type = 'image/png', name = 'photo.png', file = true } = {}) {
  const body = new FormData();
  if (file) body.append('image', new Blob([bytes], { type }), name);
  body.append('style', style); body.append('prompt', prompt);
  return body;
}
const post = body => fetch(`${base}/api/style`, { method: 'POST', body });

test('all styles return a decoded downloadable image, with no secret or base64 JSON', async () => {
  for (const style of ['casual', 'business', 'street', 'vintage']) {
    const response = await post(form({ style }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^image\/jpeg/);
    assert.equal(response.headers.get('x-styling-model'), 'gpt-image-2.5-sunburst');
    assert.match(response.headers.get('content-disposition'), /\.jpg/);
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 4);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});
test('JPEG and WEBP are decoded and accepted', async () => {
  for (const [format, type, name] of [['jpeg', 'image/jpeg', 'photo.jpg'], ['webp', 'image/webp', 'photo.webp']]) {
    const bytes = await sharp(png).toFormat(format).toBuffer();
    assert.equal((await post(form({ bytes, type, name }))).status, 200);
  }
});
test('missing image, invalid style, long prompt and unknown fields are rejected', async () => {
  for (const body of [form({ file: false }), form({ style: 'other' }), form({ prompt: 'a'.repeat(501) })]) {
    const response = await post(body); assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error.message, 'string');
  }
  const body = form(); body.append('extra', 'unexpected');
  assert.equal((await post(body)).status, 400);
});
test('duplicate and structured fields are rejected', async () => {
  const duplicate = form(); duplicate.append('style', 'street');
  assert.equal((await post(duplicate)).status, 400);
  const nested = form(); nested.delete('prompt'); nested.append('prompt[x]', 'value');
  assert.equal((await post(nested)).status, 400);
});
test('non multipart requests and malformed multipart return JSON errors', async () => {
  const response = await fetch(`${base}/api/style`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 415);
  const malformed = await fetch(`${base}/api/style`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'broken' });
  assert.equal(malformed.status, 400); assert.equal(typeof (await malformed.json()).error.message, 'string');
});
test('unsupported, spoofed, empty and corrupt images are rejected', async () => {
  for (const options of [
    { type: 'image/gif', name: 'photo.gif' },
    { type: 'image/jpeg', name: 'photo.jpg' },
    { name: 'photo.txt' },
    { bytes: Buffer.from('not an image') },
    { bytes: Buffer.alloc(0) },
    { bytes: png.subarray(0, 30) },
  ]) {
    const response = await post(form(options));
    assert.equal(response.status, 400);
  }
});
test('oversized files return 413', async () => {
  const response = await post(form({ bytes: Buffer.alloc(4 * 1024 * 1024 + 1) }));
  assert.equal(response.status, 413); assert.equal((await response.json()).error.code, 'LIMIT_FILE_SIZE');
});
test('extra files are rejected', async () => {
  const body = form(); body.append('image', new Blob([png], { type: 'image/png' }), 'second.png');
  assert.equal((await post(body)).status, 400);
});
test('frontend is served, private files are inaccessible and API misses are JSON', async () => {
  const home = await fetch(base); assert.equal(home.status, 200); assert.match(await home.text(), /FORME/);
  for (const path of ['/.env', '/src/app.js', '/package.json', '/server.js', '/test/api.test.js']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404); assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('OpenAI failures reach the frontend as sanitized JSON, without raw authentication details', async () => {
  const privateDetail = 'fixture-secret-must-never-be-returned';
  const app = createApp({ styleImage: args => generateStyling(args, {
    apiKey: privateDetail,
    fetchImpl: async () => Response.json({ error: { code: 'invalid_api_key', message: privateDetail } }, { status: 401 }),
  }) });
  const failingServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => failingServer.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${failingServer.address().port}/api/style`, { method: 'POST', body: form() });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text.includes(privateDetail), false);
    assert.equal(JSON.parse(text).error.code, 'OPENAI_AUTH_ERROR');
  } finally { await new Promise(resolve => failingServer.close(resolve)); }
});
