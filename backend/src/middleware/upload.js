import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { badRequest } from '../utils/ApiError.js';

export const uploadRoot = path.resolve(env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    // Random name + extension derived from the declared MIME type: never
    // trust the client-supplied filename.
    const ext = ALLOWED_MIME.get(file.mimetype) ?? '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(badRequest('Only JPEG, PNG or WebP images are accepted'));
    }
    return cb(null, true);
  },
}).single('image');

/** Turn multer's own errors into our JSON error shape. */
export const handleUpload = (req, res, next) => {
  uploadImage(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large' : err.message));
    }
    return next(err);
  });
};
