import cron from 'node-cron';
import { markOverdueTasks, autoActivateCourses } from '../services/course.service.js';
import { notifyTasksDueSoon, flagStuckLeads, flagDueFollowUps } from '../services/notification.service.js';
import { processDueSalaries, runStakeholderProfitShare } from '../services/finance.service.js';

export function startScheduler() {
  // Every hour: mark overdue tasks, notify due soon
  cron.schedule('0 * * * *', async () => {
    try {
      const late = await markOverdueTasks();
      if (late > 0) console.log(`[Scheduler] Marked ${late} tasks as late`);
      await notifyTasksDueSoon();
    } catch (err) {
      console.error('[Scheduler] Task job error:', err);
    }
  });

  // Daily at midnight: sync course lifecycle statuses, flag stuck / due follow-up leads
  cron.schedule('0 0 * * *', async () => {
    try {
      const activated = await autoActivateCourses();
      if (activated > 0) console.log(`[Scheduler] Updated lifecycle for ${activated} courses`);
      const stuck = await flagStuckLeads(7);
      if (stuck > 0) console.log(`[Scheduler] Flagged ${stuck} stuck leads`);
      const due = await flagDueFollowUps();
      if (due > 0) console.log(`[Scheduler] Flagged ${due} due follow-ups`);
    } catch (err) {
      console.error('[Scheduler] Daily job error:', err);
    }
  });

  // Hourly: also sync course lifecycle so status stays current during the day
  cron.schedule('15 * * * *', async () => {
    try {
      await autoActivateCourses();
    } catch (err) {
      console.error('[Scheduler] Lifecycle sync error:', err);
    }
  });

  // Daily at 6am: credit fixed salaries for employees whose payday is today
  cron.schedule('0 6 * * *', async () => {
    try {
      const result = await processDueSalaries();
      if (result.paid > 0) {
        console.log(`[Scheduler] Credited salary for ${result.paid} employee(s) (${result.period})`);
      }
    } catch (err) {
      console.error('[Scheduler] Salary payday error:', err);
    }
  });

  // Monthly on 1st at 2am: compute stakeholder profit share (pending approval)
  cron.schedule('0 2 1 * *', async () => {
    try {
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await runStakeholderProfitShare(period);
      console.log(`[Scheduler] Stakeholder profit share computed for ${period} — pending approval`);
    } catch (err) {
      console.error('[Scheduler] Profit share error:', err);
    }
  });

  console.log('[Scheduler] Background jobs started');
}
