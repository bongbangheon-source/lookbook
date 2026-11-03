import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generateStyling, supportedStyles } from '../src/styling.js';

const image = await sharp({ create: { width: 8, height: 12, channels: 3, background: 'white' } }).jpeg().toBuffer();
const request = { image, mimeType: 'image/jpeg', style: 'casual', prompt: 'navy colors' };
const key = 'test-only-secret-not-a-real-api-key';
const success = () => Response.json({ data: [{ b64_json: image.toString('base64') }] });

test('each style sends the original image and preservation instructions using the documented multipart API', async () => {
  const prompts = new Set();
  for (const style of supportedStyles) {
    let calls = 0;
    const result = await generateStyling({ ...request, style }, { apiKey: key, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/images/edits');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, `Bearer ${key}`);
      const body = options.body;
      assert.equal(body.get('model'), 'gpt-image-2.5-sunburst');
      assert.equal(body.get('output_format'), 'jpeg');
      assert.equal(body.get('n'), '1');
      assert.equal(body.has('input_fidelity'), false);
      assert.equal(body.has('response_format'), false);
      assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()), image);
      assert.equal(body.get('image[]').type, 'image/jpeg');
      const prompt = body.get('prompt');
      for (const instruction of ['face', 'identity', 'pose', 'background', 'clothing', 'navy colors']) assert(prompt.includes(instruction));
      prompts.add(prompt);
      return success();
    } });
    assert.equal(calls, 1); assert.equal(result.mimeType, 'image/jpeg');
    assert.equal((await sharp(result.buffer).metadata()).format, 'jpeg');
  }
  assert.equal(prompts.size, 4);
});
test('no key fails without making an external request', async () => {
  await assert.rejects(generateStyling(request, { apiKey: '', fetchImpl: () => { throw new Error('must not call'); } }), { code: 'OPENAI_NOT_CONFIGURED', status: 503 });
});
test('provider errors are mapped and do not leak raw messages or credentials, with no automatic retry or model fallback', async () => {
  for (const [status, upstreamCode, code, expectedStatus] of [
    [401, 'invalid_api_key', 'OPENAI_AUTH_ERROR', 503],
    [403, 'permission_denied', 'OPENAI_MODEL_UNAVAILABLE', 503],
    [404, 'model_not_found', 'OPENAI_MODEL_UNAVAILABLE', 503],
    [429, 'rate_limit_exceeded', 'OPENAI_RATE_LIMIT', 429],
    [400, 'moderation_blocked', 'EDIT_REJECTED', 422],
    [500, 'server_error', 'OPENAI_FAILED', 502],
  ]) {
    let calls = 0;
    await assert.rejects(generateStyling(request, { apiKey: key, fetchImpl: async () => {
      calls++; return Response.json({ error: { code: upstreamCode, message: key } }, { status });
    } }), error => error.code === code && error.status === expectedStatus && !error.message.includes(key));
    assert.equal(calls, 1);
  }
});
test('timeouts and network failures are actionable', async () => {
  for (const [error, code, status] of [[new DOMException('timeout', 'TimeoutError'), 'OPENAI_TIMEOUT', 504], [new TypeError('network'), 'OPENAI_CONNECTION_ERROR', 502]]) {
    await assert.rejects(generateStyling(request, { apiKey: key, fetchImpl: async () => { throw error; } }), { code, status });
  }
});
test('empty, malformed and corrupt image results fail instead of returning a sample', async () => {
  for (const data of [{ data: [] }, { data: [{ b64_json: 'not-an-image' }] }, { data: [{ url: 'https://example.com/unexpected.jpg' }] }]) {
    await assert.rejects(generateStyling(request, { apiKey: key, fetchImpl: async () => Response.json(data) }), { status: 502, code: 'INVALID_EDIT_RESULT' });
  }
});
