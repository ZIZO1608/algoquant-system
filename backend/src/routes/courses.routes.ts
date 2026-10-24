import { Router, Request, Response, NextFunction } from 'express';
import { CourseStatus, CourseType, TaskStatus } from '@prisma/client';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as courseService from '../services/course.service.js';
import * as studentService from '../services/student.service.js';
import { toMinor } from '../lib/money.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json(
      await courseService.listCourses({
        status: req.query.status as CourseStatus | undefined,
        trackId: req.query.trackId as string,
        courseType: req.query.courseType as CourseType | undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const course = await courseService.getCourse(req.paramId(), req.user!.privileges, req.user!.sub);
    res.json({
      ...course,
      allowedTransitions: courseService.getCourseAllowedTransitions(course.status),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const data: Record<string, unknown> = {
      ...req.body,
      startDate: new Date(req.body.startDate),
      priceMinor: toMinor(req.body.priceMinor),
      sessionCount: Number(req.body.sessionCount),
      capacity: Number(req.body.capacity),
      totalHours: req.body.totalHours != null ? Number(req.body.totalHours) : 0,
    };
    if ('taskPathTemplateId' in req.body) {
      data.taskPathTemplateId = req.body.taskPathTemplateId;
    }
    if (req.body.hourlyRateMinor != null && req.body.hourlyRateMinor !== '') {
      data.hourlyRateMinor = toMinor(req.body.hourlyRateMinor);
    }
    if (req.body.payPercent != null && req.body.payPercent !== '') {
      data.payPercent = Number(req.body.payPercent);
    }
    res.status(201).json(await courseService.createCourse(data as Parameters<typeof courseService.createCourse>[0], req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const data: Record<string, unknown> = { ...req.body };
    if (req.body.startDate) data.startDate = new Date(req.body.startDate);
    if (req.body.priceMinor != null && req.body.priceMinor !== '') {
      data.priceMinor = toMinor(req.body.priceMinor);
    }
    if (req.body.totalHours != null) data.totalHours = Number(req.body.totalHours);
    if (req.body.hourlyRateMinor != null && req.body.hourlyRateMinor !== '') {
      data.hourlyRateMinor = toMinor(req.body.hourlyRateMinor);
    }
    if (req.body.payPercent != null && req.body.payPercent !== '') {
      data.payPercent = Number(req.body.payPercent);
    }
    res.json(await courseService.updateCourse(req.paramId(), data, req.user!.sub, req.user!.privileges));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/transition', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const { toStatus, reason } = req.body;
    // Lifecycle statuses are automatic; only archive is manual.
    if (toStatus !== 'archived') {
      return res.status(400).json({
        error: {
          code: 'LIFECYCLE_LOCKED',
          message: 'حالة الدورة تتحدث تلقائياً حسب دورة الحياة. يمكن الأرشفة يدوياً فقط.',
        },
      });
    }
    res.json(
      await courseService.transitionCourse(
        req.paramId(),
        toStatus,
        req.user!.sub,
        reason,
        'employee',
        req.user!.privileges
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/replace-template', requirePrivileges('admin'), async (req, res, next) => {
  try {
    res.json(
      await courseService.replaceCourseTemplate(req.paramId(), req.body.templateId, req.user!.sub)
    );
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/sessions/:sessionId', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const data: { scheduledAt?: Date; durationMinutes?: number } = {};
    if (req.body.scheduledAt) data.scheduledAt = new Date(req.body.scheduledAt);
    if (req.body.durationMinutes != null && req.body.durationMinutes !== '') {
      data.durationMinutes = Number(req.body.durationMinutes);
    }
    res.json(
      await courseService.updateCourseSession(
        req.paramId(),
        req.paramId('sessionId'),
        data,
        req.user!.sub
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/attach-template', requirePrivileges('admin'), async (req, res, next) => {
  try {
    res.json(await courseService.attachTemplate(req.paramId(), req.body.templateId, req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resync-tasks-from-template', requirePrivileges('admin'), async (req, res, next) => {
  try {
    res.json(await courseService.resyncTasksFromTemplate(req.paramId(), req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/copy-task-path', requirePrivileges('admin'), async (req, res, next) => {
  try {
    res.json(
      await courseService.copyTaskPath(req.paramId(), req.body.targetCourseId, req.user!.sub)
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/enrollments', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const { studentId, leadId, totalPriceMinor } = req.body;
    res.status(201).json(
      await studentService.enrollStudent(
        req.paramId(),
        studentId,
        req.user!.sub,
        leadId,
        totalPriceMinor ? toMinor(totalPriceMinor) : undefined
      )
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id/evaluation-campaigns', requirePrivileges('admin', 'operation', 'instructor'), async (req, res, next) => {
  try {
    res.json(
      await studentService.listCourseEvaluationCampaigns(
        req.paramId(),
        req.user!.sub,
        req.user!.privileges
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/evaluation-campaigns', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const type = req.body.type === 'post_session' ? 'post_session' : 'post_course';
    if (type === 'post_course') {
      const result = await studentService.ensurePostCourseEvaluationCampaign(
        req.paramId(),
        req.body.sessionId
      );
      res.status(result.created ? 201 : 200).json(result);
      return;
    }
    res.status(201).json(
      await studentService.createEvaluationCampaign(
        req.paramId(),
        type,
        req.body.sessionId,
        req.body.closesAt ? new Date(req.body.closesAt) : undefined
      )
    );
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePrivileges('admin'), async (req, res, next) => {
  try {
    await courseService.softDeleteCourse(req.paramId(), req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
