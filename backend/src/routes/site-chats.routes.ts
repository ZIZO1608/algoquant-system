import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getSiteChatStats,
  getSiteConversation,
  listSiteConversations,
} from '../services/site-chat.service.js';

/** Website bot conversations — every signed-in employee may read them. */
const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    res.json(
      await listSiteConversations({
        filter: q.filter,
        channel: q.channel,
        q: q.q,
        before: q.before,
        limit: q.limit ? Number(q.limit) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (_req, res, next) => {
  try {
    res.json(await getSiteChatStats());
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await getSiteConversation(req.paramId()));
  } catch (err) {
    next(err);
  }
});

export default router;
