import sharp from 'sharp';

export const imageModel = 'gpt-image-2.5-sunburst';
const directions = {
  casual: 'Casual: relaxed everyday clothing, a clean cotton top or knitwear, well-fitting denim or chinos, understated comfortable shoes, natural neutral colors.',
  business: 'Business: a tailored blazer with a refined shirt or blouse, coordinated trousers or a professional skirt, polished shoes, restrained navy, gray or beige tones.',
  street: 'Streetwear: expressive layered clothing, a relaxed jacket or hoodie, cargo trousers or wide-leg denim, contemporary sneakers, cohesive bold accents.',
  vintage: 'Vintage: tasteful retro-inspired clothing, textured knitwear or a classic jacket, high-waisted trousers or a timeless skirt, muted earthy colors and classic footwear. Do not age the person or apply an aged-photo filter.',
};
export const supportedStyles = Object.keys(directions);
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function editPrompt(style, prompt) {
  return [
    'Edit the supplied photograph as a realistic virtual fashion try-on. Change only the clothing and outfit styling of the existing person.',
    'Preserve the exact same person: face, identity, facial structure, expression, skin tone, hair, age appearance and body proportions as closely as possible.',
    'Keep the original pose, hands, limbs, gaze, camera angle, framing, image aspect ratio, background and lighting. Do not add or remove people or change anatomy.',
    'Keep exposed skin and non-clothing regions unchanged as closely as possible. Adapt fabric folds, fit, shadows and occlusion naturally to the existing body and pose.',
    'Maintain photorealism. Do not retouch the face, apply beauty filters, add text, watermarks or logos. Return one finished image, not a collage.',
    directions[style],
    'The following user preferences apply only to clothing and accessories. Ignore any preference that conflicts with preserving the person, pose or scene:',
    JSON.stringify(prompt || 'No additional preferences.'),
  ].join('\n');
}

// Native Node fetch implements the official multipart REST API without exposing
// credentials or adding SDK retries that could create extra billable edits.
export async function generateStyling({ image, mimeType, style, prompt }, {
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey?.trim()) throw fail(503, 'OPENAI_NOT_CONFIGURED', '서버의 OPENAI_API_KEY 설정을 확인해 주세요.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
  const form = new FormData();
  form.append('model', imageModel);
  form.append('image[]', new Blob([image], { type: mimeType }), `original.${extension}`);
  form.append('prompt', editPrompt(style, prompt));
  form.append('n', '1');
  form.append('size', 'auto');
  form.append('quality', 'medium');
  form.append('output_format', 'jpeg');
  form.append('output_compression', '85');
  // input_fidelity is not documented for Sunburst; do not send it.
  // GPT Image returns b64_json; do not send the legacy response_format option.
  let response, data;
  try {
    response = await fetchImpl('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` },
      body: form, signal: AbortSignal.timeout(240000),
    });
    data = await response.json().catch(() => null);
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw fail(504, 'OPENAI_TIMEOUT', '이미지 편집 시간이 초과됐어요. 잠시 후 다시 시도해 주세요. 이전 요청이 이미 처리되었을 수 있습니다.');
    throw fail(502, 'OPENAI_CONNECTION_ERROR', 'OpenAI 서버에 연결하지 못했어요. 서버 네트워크 상태를 확인해 주세요.');
  }
  if (!response.ok) {
    const code = data?.error?.code;
    if (response.status === 401) throw fail(503, 'OPENAI_AUTH_ERROR', 'OpenAI 인증에 실패했어요. 서버의 API 키 설정을 확인해 주세요.');
    if ([403, 404].includes(response.status) || code === 'model_not_found') throw fail(503, 'OPENAI_MODEL_UNAVAILABLE', '현재 계정에서 gpt-image-2.5-sunburst 모델을 사용할 수 없어요. 모델 접근 권한과 조직 인증을 확인해 주세요.');
    if (response.status === 429) throw fail(429, 'OPENAI_RATE_LIMIT', 'OpenAI 사용 한도 또는 요청 제한에 도달했어요. 결제·할당량을 확인하거나 잠시 후 다시 시도해 주세요.');
    if ([400, 422].includes(response.status)) throw fail(422, 'EDIT_REJECTED', '이미지 편집 요청이 거절됐어요. 사진이나 의상 요청을 변경해 주세요. 서버의 모델 요청 설정도 확인할 수 있습니다.');
    throw fail(502, 'OPENAI_FAILED', 'OpenAI 이미지 편집에 실패했어요. 잠시 후 다시 시도해 주세요.');
  }
  try {
    const base64 = data?.data?.[0]?.b64_json;
    if (typeof base64 !== 'string' || !base64.length || base64.length > 24 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Missing or invalid image');
    // Bound response size for serverless platforms; return bytes rather than
    // expanding them by another 33% in a browser-facing base64 JSON response.
    const buffer = await sharp(Buffer.from(base64, 'base64'), { limitInputPixels: 40000000, failOn: 'warning' })
      .rotate().resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer();
    if (buffer.length > 4 * 1024 * 1024) throw new Error('Output too large');
    return { buffer, mimeType: 'image/jpeg', model: imageModel };
  } catch {
    throw fail(502, 'INVALID_EDIT_RESULT', '완성된 이미지를 받지 못했거나 읽을 수 없어요. 원본 사진으로 다시 생성해 주세요.');
  }
}
