import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.middleware.js';
import * as chatService from '../services/chat.service.js';

const router = Router();
router.use(authenticate);

const messageSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub || req.ip || 'unknown',
  message: {
    error: { code: 'RATE_LIMIT', message: 'Too many messages. Try again shortly.' },
  },
});

router.get('/', async (req, res, next) => {
  try {
    res.json(await chatService.listConversations(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/dm', async (req, res, next) => {
  try {
    const conv = await chatService.getOrCreateDM(req.user!.sub, req.body.employeeId);
    res.json(conv);
  } catch (err) {
    next(err);
  }
});

router.get('/team', async (req, res, next) => {
  try {
    res.json(await chatService.getOrCreateTeamChannel(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    res.json(await chatService.getMessages(req.paramId(), req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/messages', messageSendLimiter, async (req, res, next) => {
  try {
    res.status(201).json(
      await chatService.sendMessage(req.paramId(), req.user!.sub, req.body.body, req.body.attachments)
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    res.json(await chatService.markConversationRead(req.paramId(), req.user!.sub));
  } catch (err) {
    next(err);
  }
});

export default router;
