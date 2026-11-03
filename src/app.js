import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStyling, supportedStyles, imageModel } from './styling.js';

export function createApp({ styleImage = generateStyling } = {}) {
  const app = express();
  const maxFileSize = 4 * 1024 * 1024;
  const types = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSize, files: 1, fields: 2, parts: 4, fieldSize: 2048, fieldNameSize: 50 },
    fileFilter(req, file, callback) {
      if (!types[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) {
        return callback(fail(400, 'INVALID_IMAGE_TYPE', 'JPG, PNG 또는 WEBP 파일만 업로드할 수 있어요.'));
      }
      callback(null, true);
    },
  }).single('image');

  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'openai', model: imageModel, maxFileSize }));
  app.post('/api/style', (req, res, next) => {
    if (!req.is('multipart/form-data')) return next(fail(415, 'MULTIPART_REQUIRED', 'multipart/form-data 형식으로 사진을 전송해 주세요.'));
    upload(req, res, error => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        return next(fail(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code,
          error.code === 'LIMIT_FILE_SIZE' ? '사진 크기는 4MB 이하여야 합니다.' : '파일은 image 필드에 한 장만, style과 prompt는 각각 한 번만 전송해 주세요.'));
      }
      next(error.status ? error : fail(400, 'INVALID_MULTIPART', '업로드 요청 형식이 잘못되었습니다.'));
    });
  }, async (req, res) => {
    if (!req.file?.size) throw fail(400, 'IMAGE_REQUIRED', '이미지 파일이 필요합니다.');
    const fields = req.body ?? {};
    if (Object.keys(fields).some(key => !['style', 'prompt'].includes(key))) {
      throw fail(400, 'UNKNOWN_FIELD', '허용되지 않은 입력 필드입니다.');
    }
    if (typeof fields.style !== 'string' || !supportedStyles.includes(fields.style)) {
      throw fail(400, 'INVALID_STYLE', '캐주얼, 비즈니스, 스트리트, 빈티지 중 하나를 선택해 주세요.');
    }
    if (fields.prompt !== undefined && (typeof fields.prompt !== 'string' || fields.prompt.length > 500)) {
      throw fail(400, 'INVALID_PROMPT', '추가 요청사항은 500자 이하의 문자열이어야 합니다.');
    }
    let metadata;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 40000000, failOn: 'warning' });
      metadata = await image.metadata();
      const formatToMime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      if (formatToMime[metadata.format] !== req.file.mimetype || (metadata.pages ?? 1) > 1) throw new Error('Invalid format');
      // Decode the pixels as well: valid headers alone do not prove a valid image.
      await image.stats();
    } catch {
      throw fail(400, 'INVALID_IMAGE', '손상되었거나 실제 형식이 일치하지 않는 이미지입니다. 정적인 JPG/PNG/WEBP, 최대 4천만 픽셀을 사용해 주세요.');
    }
    const output = await styleImage({ image: req.file.buffer, mimeType: req.file.mimetype, style: fields.style, prompt: (fields.prompt ?? '').trim() });
    res.set('Content-Type', output.mimeType);
    res.set('X-Styling-Model', output.model);
    res.set('Content-Disposition', `inline; filename="forme-${fields.style}.jpg"`);
    res.send(output.buffer);
  });
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API 경로를 찾을 수 없습니다.' } }));

  // Serve only public assets; never expose the project root or .env.
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { dotfiles: 'deny' }));
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' } }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status ?? 500).json({ error: {
      code: error.status ? error.code : 'INTERNAL_ERROR',
      message: error.status ? error.message : '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    } });
  });

  return app;
}

export default createApp();
