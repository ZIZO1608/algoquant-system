import { Router } from 'express';
import { TaskSpecialty, TaskStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware.js';
import * as courseService from '../services/course.service.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json(
      await courseService.listTasks(req.user!.privileges, {
        courseId: req.query.courseId as string,
        status: req.query.status as TaskStatus | undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/suggested-assignees', async (req, res, next) => {
  try {
    const specialty = req.query.specialty as TaskSpecialty | undefined;
    if (!specialty || !(specialty in courseService.SPECIALTY_TO_PRIVILEGE)) {
      throw new ValidationError('specialty query param is required');
    }
    res.json(await courseService.suggestTaskAssignees(specialty));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/suggested-assignees', async (req, res, next) => {
  try {
    const task = await courseService.getTask(req.paramId(), req.user!.privileges);
    res.json(await courseService.suggestTaskAssignees(task.specialty));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await courseService.getTask(req.paramId(), req.user!.privileges));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.body.dueAt) data.dueAt = new Date(req.body.dueAt);
    res.json(
      await courseService.updateTask(req.paramId(), data, req.user!.sub, req.user!.privileges)
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/transition', async (req, res, next) => {
  try {
    const { toStatus } = req.body;
    res.json(
      await courseService.transitionTask(
        req.paramId(),
        toStatus,
        req.user!.sub,
        'employee',
        req.user!.privileges
      )
    );
  } catch (err) {
    next(err);
  }
});

export default router;
