import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import { hasAnyPrivilege } from '../services/auth.service.js';
import * as fileService from '../services/file.service.js';
import { ForbiddenError, ServiceUnavailableError } from '../lib/errors.js';
import { verifyDiskUrl } from '../lib/disk-storage.js';
import { prisma } from '../lib/prisma.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

function isStorageUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string; message?: string; Cause?: { code?: string } };
  const msg = (e.message || '').toLowerCase();
  return (
    e.name === 'TimeoutError' ||
    e.code === 'ECONNREFUSED' ||
    e.code === 'ENOTFOUND' ||
    e.code === 'ECONNRESET' ||
    e.code === 'ETIMEDOUT' ||
    e.Cause?.code === 'ECONNREFUSED' ||
    msg.includes('econnrefused') ||
    msg.includes('connect econnrefused') ||
    msg.includes('getaddrinfo') ||
    msg.includes('network') ||
    msg.includes('socket hang up') ||
    msg.includes('other side closed')
  );
}

// Signed download links for disk storage. The signature is the authorization (like a
// presigned S3 URL), so this sits before authenticate: browsers open it without a token.
router.get('/raw', async (req, res, next) => {
  try {
    const key = String(req.query.key || '');
    const filePath = verifyDiskUrl(key, String(req.query.exp || ''), String(req.query.sig || ''));
    if (!filePath) {
      return res
        .status(403)
        .json({ error: { code: 'INVALID_LINK', message: 'Link expired or invalid' } });
    }
    const file = await prisma.fileObject.findFirst({ where: { storageKey: key } });
    if (file?.mime) res.type(file.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  } catch (err) {
    next(err);
  }
});

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json(
      await fileService.listFiles(
        {
          entityType: req.query.entityType as string | undefined,
          entityId: req.query.entityId as string | undefined,
          purpose: req.query.purpose as string | undefined,
        },
        req.user!.privileges,
        req.user!.sub
      )
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id/url', async (req, res, next) => {
  try {
    res.json(
      await fileService.getFileDownloadUrl(req.paramId(), req.user!.privileges, req.user!.sub)
    );
  } catch (err) {
    if (isStorageUnavailable(err)) {
      return next(new ServiceUnavailableError('Storage backend unavailable'));
    }
    next(err);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file provided' } });
    }
    const purpose = (req.body.purpose as string) || 'general';
    const entityType = (req.body.entityType as string) || undefined;
    const entityId = (req.body.entityId as string) || undefined;

    if (
      entityType === 'course' &&
      !hasAnyPrivilege(req.user!.privileges, ['admin', 'operation', 'media'])
    ) {
      throw new ForbiddenError('Insufficient privileges');
    }

    const file = await fileService.createUploadedFile({
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      size: req.file.size,
      originalName: req.file.originalname,
      purpose,
      entityType,
      entityId,
      uploadedById: req.user!.sub,
    });
    res.status(201).json(file);
  } catch (err) {
    if (isStorageUnavailable(err)) {
      return next(new ServiceUnavailableError('Storage backend unavailable'));
    }
    next(err);
  }
});

router.delete('/:id', requirePrivileges('admin', 'operation', 'media'), async (req, res, next) => {
  try {
    res.json(await fileService.removeFile(req.paramId(), req.user!.privileges));
  } catch (err) {
    if (isStorageUnavailable(err)) {
      return next(new ServiceUnavailableError('Storage backend unavailable'));
    }
    next(err);
  }
});

export default router;
