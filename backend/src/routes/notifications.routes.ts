import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as notificationService from '../services/notification.service.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    res.json(await notificationService.listNotifications(req.user!.sub, unreadOnly));
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    res.json({ count: await notificationService.getUnreadCount(req.user!.sub) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    await notificationService.markNotificationRead(req.paramId(), req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await notificationService.markAllNotificationsRead(req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
