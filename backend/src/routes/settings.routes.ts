import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import * as settingsService from '../services/settings.service.js';
import * as siteChatSync from '../services/site-chat-sync.service.js';

const router = Router();

router.get('/', authenticate, async (_req, res, next) => {
  try {
    res.json(await settingsService.getAppSettings());
  } catch (err) {
    next(err);
  }
});

router.patch('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.updateAppSettings(req.body, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.get('/tracks', authenticate, async (_req, res, next) => {
  try {
    res.json(await settingsService.listTracks());
  } catch (err) {
    next(err);
  }
});

router.post('/tracks', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(
      await settingsService.createTrack(req.body.nameAr, req.body.nameEn)
    );
  } catch (err) {
    next(err);
  }
});

router.patch('/tracks/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.updateTrack(req.paramId(), req.body));
  } catch (err) {
    next(err);
  }
});

router.delete('/tracks/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await settingsService.deleteTrack(req.paramId());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/expense-categories', authenticate, async (_req, res, next) => {
  try {
    res.json(await settingsService.listExpenseCategories());
  } catch (err) {
    next(err);
  }
});

router.post('/expense-categories', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await settingsService.createExpenseCategory(req.body.code, req.body.labelAr));
  } catch (err) {
    next(err);
  }
});

router.patch('/expense-categories/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.updateExpenseCategory(req.paramId(), req.body));
  } catch (err) {
    next(err);
  }
});

router.delete('/expense-categories/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await settingsService.deleteExpenseCategory(req.paramId());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/lead-sources', authenticate, async (_req, res, next) => {
  try {
    res.json(await settingsService.listLeadSources());
  } catch (err) {
    next(err);
  }
});

router.post('/lead-sources', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(
      await settingsService.createLeadSource(req.body.code, req.body.labelAr)
    );
  } catch (err) {
    next(err);
  }
});

router.patch('/lead-sources/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.updateLeadSource(req.paramId(), req.body));
  } catch (err) {
    next(err);
  }
});

router.delete('/lead-sources/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await settingsService.deleteLeadSource(req.paramId(), req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/stakeholder-rules', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    res.json(await settingsService.listStakeholderRules());
  } catch (err) {
    next(err);
  }
});

router.post('/stakeholder-rules', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(
      await settingsService.createStakeholderRule(req.body.employeeId, Number(req.body.percent))
    );
  } catch (err) {
    next(err);
  }
});

router.patch('/stakeholder-rules/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.updateStakeholderRule(req.paramId(), Number(req.body.percent)));
  } catch (err) {
    next(err);
  }
});

router.delete('/stakeholder-rules/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await settingsService.deleteStakeholderRule(req.paramId());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/task-path-templates', authenticate, async (_req, res, next) => {
  try {
    res.json(await settingsService.listTaskPathTemplates());
  } catch (err) {
    next(err);
  }
});

router.post('/task-path-templates', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await settingsService.createTaskPathTemplate(req.body.name, req.body.description));
  } catch (err) {
    next(err);
  }
});

router.get('/task-path-templates/:id', authenticate, async (req, res, next) => {
  try {
    res.json(await settingsService.getTaskPathTemplate(req.paramId()));
  } catch (err) {
    next(err);
  }
});

router.patch('/task-path-templates/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.updateTaskPathTemplate(req.paramId(), req.body));
  } catch (err) {
    next(err);
  }
});

router.post('/task-path-templates/:id/items', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await settingsService.addTemplateItem(req.paramId(), req.body));
  } catch (err) {
    next(err);
  }
});

router.patch('/task-path-templates/items/:itemId', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.updateTemplateItem(req.paramId('itemId'), req.body));
  } catch (err) {
    next(err);
  }
});

router.delete('/task-path-templates/items/:itemId', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await settingsService.deleteTemplateItem(req.paramId('itemId'), req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/task-path-templates/:id/items/reorder', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    res.json(await settingsService.reorderTemplateItems(req.paramId(), orderedIds || []));
  } catch (err) {
    next(err);
  }
});

router.get('/webhook', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    res.json(await settingsService.getWebhookSettings());
  } catch (err) {
    next(err);
  }
});

router.post('/webhook/rotate-secret', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await settingsService.rotateWebhookSecret(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.get('/webhook/logs', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    res.json(await settingsService.getWebhookLogs(limit, offset));
  } catch (err) {
    next(err);
  }
});

// Website bot conversations: the connection to algoquant.vip's conversation feed.
router.get('/site-chat', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    res.json(await siteChatSync.getSiteChatSettings());
  } catch (err) {
    next(err);
  }
});

router.patch('/site-chat', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await siteChatSync.updateSiteChatSettings(req.body ?? {}, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/site-chat/rotate-token', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(await siteChatSync.rotateSiteChatToken(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/site-chat/test', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    res.json(await siteChatSync.testSiteChatConnection());
  } catch (err) {
    next(err);
  }
});

/** Sync now. `{ full: true }` re-reads the whole feed first (rows are idempotent). */
router.post('/site-chat/sync', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (req.body?.full) await siteChatSync.resetSiteChatCursor(req.user!.sub);
    try {
      const result = await siteChatSync.syncSiteChatsOnce();
      res.json({ ok: true, ...result, settings: await siteChatSync.getSiteChatSettings() });
    } catch (err) {
      res.json({ ok: false, error: (err as Error).message, settings: await siteChatSync.getSiteChatSettings() });
    }
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', authenticate, requireAdmin, async (req, res, next) => {
  try {
    res.json(
      await settingsService.getAuditLogs({
        employeeId: req.query.employeeId as string,
        entityType: req.query.entityType as string,
        action: req.query.action as string,
        from: req.query.from ? new Date(req.query.from as string) : undefined,
        to: req.query.to ? new Date(req.query.to as string) : undefined,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
      })
    );
  } catch (err) {
    next(err);
  }
});

export default router;
