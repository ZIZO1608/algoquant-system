import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { handleInboundLeadWebhook } from '../services/webhook.service.js';
import { handleSiteChatPush } from '../services/site-chat-sync.service.js';

const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many webhook requests' } },
});

// The website pushes after every bot reply, so a busy hour needs more room than lead webhooks.
const siteChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many webhook requests' } },
});

router.get('/leads/inbound', webhookLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query as Record<string, string | undefined>;
    const result = await handleInboundLeadWebhook(query, req.ip, req.headers as Record<string, string | string[] | undefined>);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Website conversation push: `{ conversation }` or `{ conversations: [...] }`, Bearer token. */
router.post('/site-chat', siteChatLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await handleSiteChatPush(req.body, req.headers as Record<string, string | string[] | undefined>));
  } catch (err) {
    next(err);
  }
});

export default router;
