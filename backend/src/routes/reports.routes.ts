import { Router } from 'express';
import { authenticate, requirePrivileges } from '../middleware/auth.middleware.js';
import * as reportsService from '../services/reports.service.js';
import { getPnLReport, getCashflowReport, getCourseCostReport } from '../services/finance.service.js';

const router = Router();
router.use(authenticate);

router.get('/employee-performance', requirePrivileges('admin'), async (_req, res, next) => {
  try {
    res.json(await reportsService.getEmployeePerformanceReport());
  } catch (err) {
    next(err);
  }
});

router.get('/marketing', requirePrivileges('admin', 'sales'), async (req, res, next) => {
  try {
    res.json(
      await reportsService.getMarketingReport(
        req.query.from ? new Date(req.query.from as string) : undefined,
        req.query.to ? new Date(req.query.to as string) : undefined
      )
    );
  } catch (err) {
    next(err);
  }
});

router.get('/lead-demand', requirePrivileges('admin', 'sales'), async (_req, res, next) => {
  try {
    res.json(await reportsService.getLeadDemandReport());
  } catch (err) {
    next(err);
  }
});

router.get('/pnl', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    res.json(await getPnLReport(from, to));
  } catch (err) {
    next(err);
  }
});

router.get('/cashflow', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await getCashflowReport(parseInt(req.query.months as string) || 6));
  } catch (err) {
    next(err);
  }
});

router.get('/course-costs/:courseId', requirePrivileges('admin', 'accountant'), async (req, res, next) => {
  try {
    res.json(await getCourseCostReport(req.paramId('courseId')));
  } catch (err) {
    next(err);
  }
});

router.get('/certificates', requirePrivileges('admin', 'operation'), async (_req, res, next) => {
  try {
    res.json(await reportsService.getCertificateReport());
  } catch (err) {
    next(err);
  }
});

router.get('/evaluations', requirePrivileges('admin', 'operation', 'instructor'), async (_req, res, next) => {
  try {
    res.json(await reportsService.getEvaluationReport());
  } catch (err) {
    next(err);
  }
});

router.get('/course-performance', requirePrivileges('admin', 'operation'), async (req, res, next) => {
  try {
    const courseType = req.query.courseType as 'course' | 'workshop' | undefined;
    res.json(await reportsService.getCoursePerformanceReport({ courseType }));
  } catch (err) {
    next(err);
  }
});

router.get('/stuck-lifecycle', requirePrivileges('admin', 'sales', 'operation'), async (req, res, next) => {
  try {
    res.json(await reportsService.getStuckLifecycleReport(parseInt(req.query.days as string) || 7));
  } catch (err) {
    next(err);
  }
});

router.get('/audit', requirePrivileges('admin'), async (req, res, next) => {
  try {
    res.json(
      await reportsService.getAuditReport({
        employeeId: req.query.employeeId as string,
        entityType: req.query.entityType as string,
        from: req.query.from ? new Date(req.query.from as string) : undefined,
        to: req.query.to ? new Date(req.query.to as string) : undefined,
        limit: parseInt(req.query.limit as string) || 100,
      })
    );
  } catch (err) {
    next(err);
  }
});

export default router;
