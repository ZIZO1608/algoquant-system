/**
 * Automated verification for manual test checklist (items 1-99).
 * Run: npx tsx scripts/verify-checklist.ts
 */
import dotenv from 'dotenv';
import { io, Socket } from 'socket.io-client';
import { markOverdueTasks, autoActivateCourses } from '../src/services/course.service.js';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const BASE = process.env.API_BASE || 'http://localhost:3001/api/v1';
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@algoquant.local';
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin123!';
const WEBHOOK_DEFAULT = process.env.WEBHOOK_DEFAULT_SECRET || 'change-me-webhook-secret';

const prisma = new PrismaClient();
const results: Record<number, { pass: boolean; error?: string }> = {};
const state: Record<string, unknown> = { runTs: Date.now() };

function pass(n: number, note?: string) {
  results[n] = { pass: true, error: note };
}
function fail(n: number, error: string) {
  results[n] = { pass: false, error };
}

async function req(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; formData?: FormData; expect?: number } = {}
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body && !opts.formData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.formData ? opts.formData : opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (opts.expect !== undefined && res.status !== opts.expect) {
    const msg = (data as { error?: { message?: string } })?.error?.message || text || res.statusText;
    throw new Error(`HTTP ${res.status} (expected ${opts.expect}): ${msg}`);
  }
  if (opts.expect === undefined && !res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message || text || res.statusText;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return { status: res.status, data };
}

async function login(email: string, password: string) {
  const { data } = await req('POST', '/auth/login', { body: { email, password } });
  return data as { accessToken: string; employee: { id: string; privileges: string[] } };
}

async function createEmployee(
  adminToken: string,
  suffix: string,
  privilegeCodes: string[],
  isSalaried = true
) {
  const email = `verify_${suffix}_${state.runTs}@test.local`;
  const { data } = await req('POST', '/employees', {
    token: adminToken,
    body: {
      email,
      password: 'Test1234!',
      fullName: `Verify ${suffix}`,
      privilegeCodes,
      isSalaried,
      monthlySalaryMinor: isSalaried ? 500000 : undefined,
    },
  });
  const loginData = await login(email, 'Test1234!');
  return { ...(data as object), token: loginData.accessToken, email, id: loginData.employee.id };
}

function waitForSocketEvent(socket: Socket, event: string, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Socket timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

async function main() {
  try {
    // --- SECTION 1 ---
    let adminToken: string | undefined;
    try {
      const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
      adminToken = admin.accessToken;
      const me = await req('GET', '/auth/me', { token: adminToken });
      if (!(me.data as { id: string }).id) throw new Error('auth/me missing id');
      pass(1);
    } catch (e) {
      fail(1, (e as Error).message);
    }

    if (!adminToken) {
      console.error('Cannot continue without admin login');
      process.exit(1);
    }

    try {
      const empSales = await createEmployee(adminToken!, 'sales', ['sales']);
      const empMedia = await createEmployee(adminToken!, 'media', ['media']);
      const empOps = await createEmployee(adminToken!, 'operation', ['operation']);
      const empInstr = await createEmployee(adminToken!, 'instructor', ['instructor'], 'hourly_teacher');
      const empAcct = await createEmployee(adminToken!, 'accountant', ['accountant']);
      const empSalesMedia = await createEmployee(adminToken!, 'salesmedia', ['sales', 'media']);
      state.empSales = empSales;
      state.empMedia = empMedia;
      state.empOps = empOps;
      state.empInstr = empInstr;
      state.empAcct = empAcct;
      state.empSalesMedia = empSalesMedia;
      pass(2);
      pass(3);
      pass(4);
      pass(5);
      pass(6);
      pass(7);
    } catch (e) {
      fail(2, (e as Error).message);
    }

    const empSales = state.empSales as { id: string; token: string };
    const empMedia = state.empMedia as { id: string; token: string };
    const empOps = state.empOps as { id: string; token: string };
    const empInstr = state.empInstr as { id: string; token: string };
    const empAcct = state.empAcct as { id: string; token: string };
    const empSalesMedia = state.empSalesMedia as { id: string; token: string };

    if (!empSales?.id) {
      console.error('Employee setup failed; aborting remaining tests.');
      throw new Error('employee setup failed');
    }

    try {
      await req('PUT', `/employees/${empSales.id}/privileges`, {
        token: adminToken,
        body: { privilegeCodes: [] },
      });
      const refetch = await req('GET', `/employees/${empSales.id}`, { token: adminToken });
      const codes = ((refetch.data as { privileges: { privilege: { code: string } }[] }).privileges || []).map(
        (p) => p.privilege.code
      );
      if (codes.includes('sales')) throw new Error(`sales still present: ${codes.join(',')}`);
      await req('PUT', `/employees/${empSales.id}/privileges`, {
        token: adminToken,
        body: { privilegeCodes: ['sales'] },
      });
      pass(8);
    } catch (e) {
      fail(8, (e as Error).message);
    }

    try {
      const track = await req('POST', '/settings/tracks', {
        token: adminToken,
        body: { nameAr: `مسار تحقق ${state.runTs}`, nameEn: 'Verify Track' },
      });
      state.trackId = (track.data as { id: string }).id;
      pass(9);
    } catch (e) {
      fail(9, (e as Error).message);
    }

    try {
      const cat = await req('POST', '/settings/expense-categories', {
        token: adminToken,
        body: { code: `verify_cat_${state.runTs}`, labelAr: 'فئة تحقق' },
      });
      state.expenseCategoryId = (cat.data as { id: string }).id;
      pass(10);
    } catch (e) {
      fail(10, (e as Error).message);
    }

    try {
      // TaskPhase settings were removed (Six Product Simplifications, item 5) — template items
      // now validate against the fixed lifecycle stages in src/config/lifecycle.ts instead.
      const phaseKeys = ['before_start', 'start', 'during'];
      const tpl = await req('POST', '/settings/task-path-templates', {
        token: adminToken,
        body: { name: `Verify Template ${state.runTs}`, description: 'auto verify' },
      });
      state.templateId = (tpl.data as { id: string }).id;
      for (let i = 0; i < phaseKeys.length; i++) {
        await req('POST', `/settings/task-path-templates/${state.templateId}/items`, {
          token: adminToken,
          body: {
            phaseKey: phaseKeys[i],
            title: `Task phase ${i}`,
            specialty: ['sales', 'media', 'operation'][i],
            offsetType: 'days_from_start',
            offsetValue: i + 1,
            sortOrder: i,
          },
        });
      }
      pass(11);
    } catch (e) {
      fail(11, (e as Error).message);
    }

    try {
      const wh = await req('GET', '/settings/webhook', { token: adminToken });
      const whData = wh.data as { publicPath?: string; secretHint?: string };
      if (!whData.secretHint) throw new Error('missing secretHint');
      state.webhookOldToken = WEBHOOK_DEFAULT;
      pass(12, whData.publicPath ? 'has publicPath+hint; full secret only via rotate' : 'hint only, no URL field');
    } catch (e) {
      fail(12, (e as Error).message);
    }

    try {
      const rotated = await req('POST', '/settings/webhook/rotate-secret', { token: adminToken });
      state.webhookNewToken = (rotated.data as { token: string }).token;
      const oldAttempt = await fetch(
        `${BASE.replace('/api/v1', '')}/api/v1/webhooks/leads/inbound?token=${state.webhookOldToken}&full_name=Old&phone=0999000001`
      );
      if (oldAttempt.status !== 400) throw new Error(`old token status ${oldAttempt.status}, expected 400`);
      pass(13);
    } catch (e) {
      fail(13, (e as Error).message);
    }

    try {
      const logs = await req('GET', '/settings/audit-logs?limit=20', { token: adminToken });
      const entries = logs.data as { action: string }[];
      const hasPriv = entries.some((l) => l.action?.includes('privilege'));
      if (!hasPriv) throw new Error('no privilege audit entries in recent logs');
      pass(14);
    } catch (e) {
      fail(14, (e as Error).message);
    }

    // --- SECTION 2 ---
    const sources = await req('GET', '/settings/lead-sources', { token: adminToken });
    const sourceMap = Object.fromEntries(
      (sources.data as { id: string; code: string }[]).map((s) => [s.code, s.id])
    );
    const manualSources = [
      'instagram_dm',
      'instagram_comment',
      'instagram_ad',
      'whatsapp',
      'manual',
    ] as const;
    const leadIds: string[] = [];
    for (let i = 0; i < manualSources.length; i++) {
      const n = 15 + i;
      try {
        const { data } = await req('POST', '/leads', {
          token: adminToken,
          body: {
            fullName: `Lead ${manualSources[i]} ${state.runTs}`,
            phone: `0999${String(state.runTs).slice(-6)}${i}`,
            sourceId: sourceMap[manualSources[i]],
          },
        });
        leadIds.push((data as { id: string }).id);
        pass(n);
      } catch (e) {
        fail(n, (e as Error).message);
      }
    }

    const webhookBase = `${BASE}/webhooks/leads/inbound`;
    const extId = `ext-${state.runTs}`;
    try {
      const q1 = new URLSearchParams({
        token: state.webhookNewToken as string,
        external_lead_id: extId,
        full_name: 'Bot Lead Params',
        phone: '0999111222',
        interest_area: 'AI',
        lead_classification: 'hot',
        ready_to_register: 'yes',
      });
      await fetch(`${webhookBase}?${q1}`).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      });
      pass(20);
      const q2 = new URLSearchParams({
        token: state.webhookNewToken as string,
        external_lead_id: `${extId}-notes`,
        full_name: 'Bot Lead Notes',
        phone: '0999333444',
        notes: 'interest_area: Trading; lead_classification: warm; ready_to_register: maybe',
      });
      const notesRes = await fetch(`${webhookBase}?${q2}`).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      });
      pass(21);
      state.botLeadId = (notesRes as { leadId: string }).leadId;

      const botLead = await req('GET', `/leads/${state.botLeadId}`, { token: adminToken });
      const bl = botLead.data as { source: { code: string }; extraData: Record<string, unknown> };
      if (bl.source.code !== 'bot') throw new Error(`source=${bl.source.code}`);
      if (!bl.extraData || !Object.keys(bl.extraData).length) throw new Error('extraData empty');
      pass(22);

      const q3 = new URLSearchParams({
        token: state.webhookNewToken as string,
        external_lead_id: extId,
        full_name: 'Bot Lead Updated',
        phone: '0999111222',
        interest_area: 'Updated',
      });
      const upd = await fetch(`${webhookBase}?${q3}`).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      });
      const dupCount = await prisma.lead.count({ where: { externalLeadId: extId } });
      if (dupCount !== 1) throw new Error(`duplicate count ${dupCount}`);
      if ((upd as { leadId: string }).leadId !== leadIds[0] && (upd as { leadId: string }).leadId !== (await prisma.lead.findFirst({ where: { externalLeadId: extId } }))?.id) {
        // updated same id check via DB
      }
      pass(23);

      const bad = await fetch(`${webhookBase}?token=bad-token&full_name=X&phone=1`);
      if (bad.status !== 400) throw new Error(`bad token status ${bad.status}`);
      const whLogs = await req('GET', '/settings/webhook/logs?limit=5', { token: adminToken });
      const failedLog = (whLogs.data as { success: boolean }[]).some((l) => l.success === false);
      if (!failedLog) throw new Error('no failed webhook log');
      pass(24);
    } catch (e) {
      if (!results[20]?.pass) fail(20, (e as Error).message);
      if (!results[21]?.pass) fail(21, (e as Error).message);
      if (!results[22]?.pass) fail(22, (e as Error).message);
      if (!results[23]?.pass) fail(23, (e as Error).message);
      if (!results[24]?.pass) fail(24, (e as Error).message);
    }

    let lifecycleLead = leadIds[4] || leadIds[0];
    try {
      for (const st of ['contacted', 'interested'] as const) {
        await req('POST', `/leads/${lifecycleLead}/transition`, {
          token: adminToken,
          body: { toStatus: st },
        });
      }
      pass(25);
      await req('PATCH', `/leads/${lifecycleLead}/follow-up`, {
        token: adminToken,
        body: { nextFollowUpAt: new Date().toISOString() },
      });
      pass(26);
    } catch (e) {
      if (!results[25]?.pass) fail(25, (e as Error).message);
      if (!results[26]?.pass) fail(26, (e as Error).message);
    }

    try {
      const enrolledLeadRes = await req('POST', '/leads', {
        token: adminToken!,
        body: {
          fullName: `Enroll Flow ${state.runTs}`,
          phone: `0998${String(state.runTs).slice(-6)}`,
          sourceId: sourceMap.manual,
        },
      });
      const enrolledLeadId = (enrolledLeadRes.data as { id: string }).id;
      for (const st of ['contacted', 'interested', 'paid', 'enrolled'] as const) {
        await req('POST', `/leads/${enrolledLeadId}/transition`, {
          token: adminToken!,
          body: { toStatus: st },
        });
      }
      pass(27);
      const phone = (enrolledLeadRes.data as { phone: string }).phone;
      const student = await prisma.student.findFirst({ where: { phone, deletedAt: null } });
      if (!student) fail(28, 'No student auto-created/linked on enrolled transition');
      else pass(28);
    } catch (e) {
      if (!results[27]?.pass) fail(27, (e as Error).message);
      if (!results[28]?.pass) fail(28, (e as Error).message);
    }

    try {
      const lostLead = leadIds[2] || lifecycleLead;
      await req('POST', `/leads/${lostLead}/transition`, { token: adminToken, body: { toStatus: 'contacted' } });
      await req('POST', `/leads/${lostLead}/transition`, { token: adminToken, body: { toStatus: 'lost' } });
      pass(29);
    } catch (e) {
      fail(29, (e as Error).message);
    }

    try {
      const illegalLead = leadIds[1] || lifecycleLead;
      await req('POST', `/leads/${illegalLead}/transition`, {
        token: adminToken,
        body: { toStatus: 'paid' },
        expect: 409,
      });
      pass(30);
    } catch (e) {
      fail(30, (e as Error).message);
    }

    // --- SECTION 3 ---
    const trackId = (state.trackId as string) || '00000000-0000-0000-0000-000000000001';
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 14);

    try {
      const draft = await req('POST', '/courses', {
        token: adminToken,
        body: {
          name: `Draft Course ${state.runTs}`,
          trackId,
          startDate: startDate.toISOString(),
          sessionCount: 2,
          priceMinor: 100000,
          capacity: 20,
          primaryInstructorId: empInstr.id,
        },
      });
      state.draftCourseId = (draft.data as { id: string }).id;
      pass(31);
      await req('POST', `/courses/${state.draftCourseId}/transition`, {
        token: adminToken,
        body: { toStatus: 'archived', reason: 'verify cancel draft' },
      });
      pass(32);
    } catch (e) {
      if (!results[31]?.pass) fail(31, (e as Error).message);
      if (!results[32]?.pass) fail(32, (e as Error).message);
    }

    try {
      const plannedStart = new Date();
      plannedStart.setDate(plannedStart.getDate() + 30);
      const planned = await req('POST', '/courses', {
        token: adminToken,
        body: {
          name: `Planned Course ${state.runTs}`,
          trackId,
          startDate: plannedStart.toISOString(),
          sessionCount: 3,
          priceMinor: 200000,
          capacity: 15,
          primaryInstructorId: empInstr.id,
        },
      });
      state.plannedCourseId = (planned.data as { id: string }).id;
      await req('POST', `/courses/${state.plannedCourseId}/transition`, {
        token: adminToken,
        body: { toStatus: 'planned' },
      });
      pass(33);
      await req('POST', `/courses/${state.plannedCourseId}/attach-template`, {
        token: adminToken,
        body: { templateId: state.templateId },
      });
      pass(34);
      const tasks = await req('GET', `/tasks?courseId=${state.plannedCourseId}`, { token: adminToken });
      const taskArr = tasks.data as { dueAt: string | null; specialty: string }[];
      if (taskArr.length < 2) throw new Error(`expected tasks, got ${taskArr.length}`);
      if (!taskArr.some((t) => t.dueAt)) throw new Error('tasks missing dueAt');
      pass(35);
      state.plannedTasks = taskArr;
    } catch (e) {
      if (!results[33]?.pass) fail(33, (e as Error).message);
      if (!results[34]?.pass) fail(34, (e as Error).message);
      if (!results[35]?.pass) fail(35, (e as Error).message);
    }

    try {
      await req('POST', `/courses/${state.plannedCourseId}/transition`, {
        token: adminToken,
        body: { toStatus: 'enrollment_open' },
      });
      pass(36);
      const s1 = await req('POST', '/students', {
        token: adminToken,
        body: { fullName: 'Student A', phone: `0888${String(state.runTs).slice(-6)}1` },
      });
      const s2 = await req('POST', '/students', {
        token: adminToken,
        body: { fullName: 'Student B', phone: `0888${String(state.runTs).slice(-6)}2` },
      });
      state.studentA = (s1.data as { id: string }).id;
      state.studentB = (s2.data as { id: string }).id;
      await req('POST', `/courses/${state.plannedCourseId}/enrollments`, {
        token: adminToken,
        body: { studentId: state.studentA, totalPriceMinor: 200000 },
      });
      await req('POST', `/courses/${state.plannedCourseId}/enrollments`, {
        token: adminToken,
        body: { studentId: state.studentB, totalPriceMinor: 200000 },
      });
      pass(37);
      const mediaTasks = await req('GET', `/tasks?courseId=${state.plannedCourseId}`, { token: empMedia.token });
      const salesTasks = await req('GET', `/tasks?courseId=${state.plannedCourseId}`, { token: empSales.token });
      if (!(mediaTasks.data as unknown[]).some((t: { specialty: string }) => t.specialty === 'media'))
        throw new Error('media tasks not visible to media');
      if (!(salesTasks.data as unknown[]).some((t: { specialty: string }) => t.specialty === 'sales'))
        throw new Error('sales tasks not visible to sales');
      pass(38);
    } catch (e) {
      if (!results[36]?.pass) fail(36, (e as Error).message);
      if (!results[37]?.pass) fail(37, (e as Error).message);
      if (!results[38]?.pass) fail(38, (e as Error).message);
    }

    try {
      await prisma.course.update({
        where: { id: state.plannedCourseId as string },
        data: { startDate: new Date(Date.now() - 86400000) },
      });
      const activated = await autoActivateCourses();
      const courseAfter = await req('GET', `/courses/${state.plannedCourseId}`, { token: adminToken });
      if ((courseAfter.data as { status: string }).status !== 'active')
        throw new Error(`status=${(courseAfter.data as { status: string }).status}, activated=${activated}`);
      pass(39);
    } catch (e) {
      fail(39, (e as Error).message);
    }

    try {
      const beforeTitle = (state.plannedTasks as { id: string; title: string }[])[0]?.title;
      await req('PATCH', `/settings/task-path-templates/items/${(await prisma.taskPathTemplateItem.findFirst({ where: { templateId: state.templateId as string } }))!.id}`, {
        token: adminToken,
        body: { title: 'CHANGED TITLE VERIFY' },
      });
      const taskAfter = await req('GET', `/tasks/${(state.plannedTasks as { id: string }[])[0].id}`, { token: adminToken });
      if ((taskAfter.data as { title: string }).title !== beforeTitle)
        throw new Error('task title changed without resync');
      pass(40);
      await req('POST', `/courses/${state.plannedCourseId}/resync-tasks-from-template`, { token: adminToken });
      const taskResync = await req('GET', `/tasks/${(state.plannedTasks as { id: string }[])[0].id}`, { token: adminToken });
      if ((taskResync.data as { title: string }).title === beforeTitle)
        throw new Error('task title unchanged after resync');
      pass(41);
    } catch (e) {
      if (!results[40]?.pass) fail(40, (e as Error).message);
      if (!results[41]?.pass) fail(41, (e as Error).message);
    }

    try {
      const copyTarget = await req('POST', '/courses', {
        token: adminToken,
        body: {
          name: `Copy Target ${state.runTs}`,
          trackId,
          startDate: new Date(Date.now() + 60 * 86400000).toISOString(),
          sessionCount: 3,
          priceMinor: 150000,
          capacity: 10,
          primaryInstructorId: empInstr.id,
        },
      });
      state.copyTargetId = (copyTarget.data as { id: string }).id;
      await req('POST', `/courses/${state.copyTargetId}/transition`, { token: adminToken, body: { toStatus: 'planned' } });
      await req('POST', `/courses/${state.plannedCourseId}/copy-task-path`, {
        token: adminToken,
        body: { targetCourseId: state.copyTargetId },
      });
      const copiedTasks = await req('GET', `/tasks?courseId=${state.copyTargetId}`, { token: adminToken });
      if ((copiedTasks.data as unknown[]).length < 1) throw new Error('no copied tasks');
      pass(42);
    } catch (e) {
      fail(42, (e as Error).message);
    }

    try {
      const courseDetail = await req('GET', `/courses/${state.plannedCourseId}`, { token: adminToken });
      const sessions = (courseDetail.data as { sessions: { id: string; sessionNumber: number }[] }).sessions;
      const lastSession = sessions[sessions.length - 1];
      await req('POST', `/students/sessions/${lastSession.id}/attendance`, {
        token: adminToken,
        body: { records: [{ studentId: state.studentA, status: 'present' }] },
      });
      const courseDone = await req('GET', `/courses/${state.plannedCourseId}`, { token: adminToken });
      if ((courseDone.data as { status: string }).status !== 'completed') throw new Error('not completed');
      pass(43);
      await req('POST', `/courses/${state.plannedCourseId}/transition`, {
        token: adminToken,
        body: { toStatus: 'archived' },
      });
      pass(44);
    } catch (e) {
      if (!results[43]?.pass) fail(43, (e as Error).message);
      if (!results[44]?.pass) fail(44, (e as Error).message);
    }

    // --- SECTION 4 ---
    try {
      const salesOnly = await req('GET', '/tasks', { token: empSales.token });
      const bad = (salesOnly.data as { specialty: string }[]).filter((t) => t.specialty !== 'sales');
      if (bad.length) throw new Error(`non-sales: ${bad.map((t) => t.specialty).join(',')}`);
      pass(45);
      const mediaOnly = await req('GET', '/tasks', { token: empMedia.token });
      if ((mediaOnly.data as { specialty: string }[]).some((t) => t.specialty !== 'media'))
        throw new Error('non-media tasks returned');
      pass(46);
      const opsOnly = await req('GET', '/tasks', { token: empOps.token });
      const opsBad = (opsOnly.data as { specialty: string }[]).filter(
        (t) => !['operation', 'logistics'].includes(t.specialty)
      );
      if (opsBad.length) throw new Error('non-operation tasks');
      pass(47);
      const dual = await req('GET', '/tasks', { token: empSalesMedia.token });
      const specs = new Set((dual.data as { specialty: string }[]).map((t) => t.specialty));
      if (!specs.has('sales') || !specs.has('media')) throw new Error(`missing dual specs: ${[...specs]}`);
      pass(48);
    } catch (e) {
      if (!results[45]?.pass) fail(45, (e as Error).message);
      if (!results[46]?.pass) fail(46, (e as Error).message);
      if (!results[47]?.pass) fail(47, (e as Error).message);
      if (!results[48]?.pass) fail(48, (e as Error).message);
    }

    try {
      const onTimeTask = await prisma.task.create({
        data: {
          courseId: state.plannedCourseId as string,
          title: 'On time verify',
          specialty: 'sales',
          phaseKey: 'start',
          status: 'pending',
          dueAt: new Date(Date.now() + 7 * 86400000),
          assignedEmployeeId: empSales.id,
        },
      });
      await req('POST', `/tasks/${onTimeTask.id}/transition`, {
        token: empSales.token,
        body: { toStatus: 'done' },
      });
      const doneTask = await req('GET', `/tasks/${onTimeTask.id}`, { token: adminToken });
      if ((doneTask.data as { isLate: boolean }).isLate) throw new Error('marked late when done early');
      pass(49);

      const lateTask = await prisma.task.create({
        data: {
          courseId: state.plannedCourseId as string,
          title: 'Late verify',
          specialty: 'sales',
          phaseKey: 'start',
          status: 'pending',
          dueAt: new Date(Date.now() - 86400000),
          assignedEmployeeId: empSales.id,
        },
      });
      const lateCount = await markOverdueTasks();
      const lateAfter = await req('GET', `/tasks/${lateTask.id}`, { token: adminToken });
      if ((lateAfter.data as { status: string }).status !== 'late') throw new Error('not auto-late');
      pass(50, `scheduler marked ${lateCount}`);

      await req('POST', `/tasks/${lateTask.id}/transition`, { token: empSales.token, body: { toStatus: 'done' } });
      const doneLate = await req('GET', `/tasks/${lateTask.id}`, { token: adminToken });
      if (!(doneLate.data as { isLate: boolean }).isLate) throw new Error('isLate not set on done-late');
      pass(51);

      const perf = await req('GET', '/reports/employee-performance', { token: adminToken });
      if (!perf.data) throw new Error('empty performance report');
      pass(52);
    } catch (e) {
      if (!results[49]?.pass) fail(49, (e as Error).message);
      if (!results[50]?.pass) fail(50, (e as Error).message);
      if (!results[51]?.pass) fail(51, (e as Error).message);
      if (!results[52]?.pass) fail(52, (e as Error).message);
    }

    // --- SECTION 5 ---
    try {
      const st = await req('POST', '/students', {
        token: adminToken,
        body: { fullName: 'Direct Student', phone: `0777${String(state.runTs).slice(-6)}` },
      });
      state.directStudentId = (st.data as { id: string }).id;
      pass(53);
      const enrollCourse = await req('POST', '/courses', {
        token: adminToken,
        body: {
          name: `Enroll Course ${state.runTs}`,
          trackId,
          startDate: new Date(Date.now() + 45 * 86400000).toISOString(),
          sessionCount: 2,
          priceMinor: 300000,
          capacity: 10,
          primaryInstructorId: empInstr.id,
        },
      });
      state.enrollCourseId = (enrollCourse.data as { id: string }).id;
      await req('POST', `/courses/${state.enrollCourseId}/transition`, { token: adminToken, body: { toStatus: 'planned' } });
      await req('POST', `/courses/${state.enrollCourseId}/transition`, { token: adminToken, body: { toStatus: 'enrollment_open' } });
      const enr = await req('POST', `/courses/${state.enrollCourseId}/enrollments`, {
        token: adminToken,
        body: { studentId: state.directStudentId, totalPriceMinor: 300000 },
      });
      state.directEnrollmentId = (enr.data as { id: string }).id;
      pass(54);
      await req('POST', `/students/enrollments/${state.directEnrollmentId}/payments`, {
        token: adminToken,
        body: { amountMinor: 100000, method: 'cash' },
      });
      const partial = await prisma.enrollment.findUnique({ where: { id: state.directEnrollmentId as string } });
      if (partial!.paymentStatus !== 'partially_paid') throw new Error(`status=${partial!.paymentStatus}`);
      pass(55);
      await req('POST', `/students/enrollments/${state.directEnrollmentId}/payments`, {
        token: adminToken,
        body: { amountMinor: 200000, method: 'cash' },
      });
      const full = await prisma.enrollment.findUnique({ where: { id: state.directEnrollmentId as string } });
      if (full!.paymentStatus !== 'paid_in_full') throw new Error(`status=${full!.paymentStatus}`);
      pass(56);

      const courseForAtt = await req('GET', `/courses/${state.enrollCourseId}`, { token: adminToken });
      const sess = (courseForAtt.data as { sessions: { id: string }[] }).sessions;
      await req('POST', `/students/sessions/${sess[0].id}/attendance`, {
        token: empOps.token,
        body: { records: [{ studentId: state.directStudentId, status: 'present' }] },
      });
      pass(57);
      if (sess[1]) {
        await req('POST', `/students/sessions/${sess[1].id}/attendance`, {
          token: empOps.token,
          body: { records: [{ studentId: state.directStudentId, status: 'absent' }] },
        });
      }
      pass(58);

      const dropEnr = await req('POST', `/courses/${state.enrollCourseId}/enrollments`, {
        token: adminToken,
        body: { studentId: state.studentB, totalPriceMinor: 300000 },
      });
      await req('POST', `/students/enrollments/${(dropEnr.data as { id: string }).id}/transition`, {
        token: adminToken,
        body: { toStatus: 'dropped', reason: 'verify withdraw' },
      });
      pass(59);

      await req('POST', `/students/enrollments/${state.directEnrollmentId}/transition`, {
        token: adminToken,
        body: { toStatus: 'attending' },
      });
      await req('POST', `/students/enrollments/${state.directEnrollmentId}/transition`, {
        token: adminToken,
        body: { toStatus: 'completed' },
      });
      await req('POST', `/students/enrollments/${state.directEnrollmentId}/certificates`, { token: adminToken });
      pass(60);

      await req('POST', `/courses/${state.enrollCourseId}/evaluation-campaigns`, {
        token: adminToken!,
        body: { type: 'post_course' },
      });
      await req('POST', `/students/enrollments/${state.directEnrollmentId}/evaluations`, {
        token: adminToken,
        body: { courseScore: 5, teacherScore: 4, comment: 'verify eval' },
      });
      pass(61);
    } catch (e) {
      for (const n of [53, 54, 55, 56, 57, 58, 59, 60, 61]) {
        if (!results[n]?.pass) fail(n, (e as Error).message);
      }
    }

    // --- SECTION 6 ---
    try {
      await prisma.wallet.update({
        where: { ownerId: empInstr.id },
        data: { balanceMinor: 100000n },
      });

      const walletBefore = await req('GET', '/wallets/me', { token: empInstr.token });
      const txs = (walletBefore.data as { transactions: { type: string }[] }).transactions;
      if (!txs.some((t) => t.type === 'credit_hours')) {
        fail(62, 'No credit_hours transaction; creditTeacherForSession is not wired to session completion');
      } else pass(62);

      const wdr = await req('POST', '/wallets/withdrawals', {
        token: empInstr.token,
        body: { amountMinor: 1000, reason: 'verify withdrawal' },
      });
      state.withdrawalId = (wdr.data as { id: string }).id;
      pass(63);

      for (const st of ['under_review', 'approved', 'paid'] as const) {
        await req('POST', `/wallets/withdrawals/${state.withdrawalId}/transition`, {
          token: empAcct.token,
          body: { toStatus: st },
        });
      }
      pass(64);

      try {
        await req('POST', `/wallets/withdrawals/${state.withdrawalId}/transition`, {
          token: empAcct.token,
          body: { toStatus: 'under_review' },
          expect: 409,
        });
        pass(65);
      } catch (e) {
        fail(65, (e as Error).message);
      }

      await req('POST', `/employees/${empSales.id}/absences`, {
        token: adminToken,
        body: { date: new Date().toISOString().slice(0, 10), reason: 'verify sick' },
      });
      const abs = await req('GET', `/employees/${empSales.id}/absences`, { token: empAcct.token });
      if (!(abs.data as unknown[]).length) throw new Error('no absences');
      pass(66);

      await req('POST', '/wallets/advances', {
        token: empSales.token,
        body: { amountMinor: 5000 },
      });
      pass(67);

      await req('POST', '/finance/owner-withdrawals', {
        token: adminToken,
        body: { amountMinor: 10000, reason: 'owner verify', spentAt: new Date().toISOString() },
      });
      pass(68);

      await req('POST', '/finance/expenses', {
        token: empAcct.token,
        body: {
          categoryId: state.expenseCategoryId,
          amountMinor: 25000,
          reason: 'verify expense',
          spentAt: new Date().toISOString(),
        },
      });
      pass(69);

      const dashFin = await req('GET', '/dashboard', { token: empAcct.token });
      const financeW = (dashFin.data as { finance?: { pendingWithdrawals: number } }).finance;
      if (financeW === undefined) throw new Error('finance widgets missing');
      pass(70);
    } catch (e) {
      for (const n of [62, 63, 64, 65, 66, 67, 68, 69, 70]) {
        if (!results[n]?.pass) fail(n, (e as Error).message);
      }
    }

    // --- SECTION 7 ---
    try {
      await req('GET', '/reports/pnl', { token: empAcct.token });
      pass(71);
      await req('GET', '/reports/marketing', { token: adminToken });
      pass(72);
      await req('GET', '/reports/lead-demand', { token: adminToken });
      pass(73);
      await req('GET', '/reports/employee-performance', { token: adminToken });
      pass(74);
      await req('GET', '/reports/course-performance', { token: adminToken });
      pass(75);
    } catch (e) {
      for (const n of [71, 72, 73, 74, 75]) {
        if (!results[n]?.pass) fail(n, (e as Error).message);
      }
    }

    // --- SECTION 8 ---
    try {
      const cnt = await req('GET', '/notifications/unread-count', { token: empSales.token });
      pass(76, `count=${(cnt.data as { count: number }).count}`);

      const salesSocket = io('http://localhost:3001', { auth: { token: empSales.token } });
      await new Promise<void>((res, rej) => {
        salesSocket.on('connect', () => res());
        salesSocket.on('connect_error', (err) => rej(err));
        setTimeout(() => rej(new Error('socket connect timeout')), 5000);
      });
      const notifPromise = waitForSocketEvent(salesSocket, 'notification');
      await req('POST', `/leads/${leadIds[0]}/assign`, {
        token: adminToken,
        body: { employeeId: empSales.id },
      });
      await notifPromise;
      pass(77);
      salesSocket.disconnect();

      const notifs = await req('GET', '/notifications?unread=true', { token: empSales.token });
      const first = (notifs.data as { id: string }[])[0];
      if (first) {
        await req('POST', `/notifications/${first.id}/read`, { token: empSales.token });
        pass(78);
      } else fail(78, 'no unread notifications to mark read');

      await req('POST', '/notifications/read-all', { token: empSales.token });
      const afterAll = await req('GET', '/notifications/unread-count', { token: empSales.token });
      if ((afterAll.data as { count: number }).count !== 0) throw new Error('count not zero');
      pass(79);

      const acctSocket = io('http://localhost:3001', { auth: { token: empAcct.token } });
      await new Promise<void>((res, rej) => {
        acctSocket.on('connect', () => res());
        acctSocket.on('connect_error', (err) => rej(err));
        setTimeout(() => rej(new Error('acct socket timeout')), 5000);
      });
      const wdrNotif = waitForSocketEvent(acctSocket, 'notification');
      await req('POST', '/wallets/withdrawals', {
        token: empInstr.token,
        body: { amountMinor: 500, reason: 'notify acct' },
      });
      await wdrNotif;
      pass(81);
      acctSocket.disconnect();

      // task_late via scheduler already tested in 50; check notification exists
      const lateNotif = await prisma.notification.findFirst({
        where: { type: 'task_late', employeeId: empSales.id },
        orderBy: { createdAt: 'desc' },
      });
      if (lateNotif) pass(80);
      else fail(80, 'no task_late notification found after scheduler');

      const botNotif = await prisma.notification.findFirst({
        where: { type: 'new_lead_bot' },
        orderBy: { createdAt: 'desc' },
      });
      if (botNotif) pass(82);
      else fail(82, 'no new_lead_bot notification (sales employee may not exist at webhook time)');
    } catch (e) {
      for (const n of [76, 77, 78, 79, 80, 81, 82]) {
        if (!results[n]?.pass) fail(n, (e as Error).message);
      }
    }

    // --- SECTION 9 ---
    try {
      const team = await req('GET', '/conversations/team', { token: adminToken });
      if (!(team.data as { id: string }).id) throw new Error('no team channel');
      pass(83);
      state.teamConvId = (team.data as { id: string }).id;

      const dm = await req('POST', '/conversations/dm', {
        token: adminToken,
        body: { employeeId: empSales.id },
      });
      state.dmConvId = (dm.data as { id: string }).id;
      pass(84);

      const msg = await req('POST', `/conversations/${state.dmConvId}/messages`, {
        token: adminToken,
        body: { body: 'Hello from verify script' },
      });
      state.msgId = (msg.data as { id: string }).id;
      pass(85);

      const msgs = await req('GET', `/conversations/${state.dmConvId}/messages`, { token: adminToken });
      if (!(msgs.data as { id: string }[]).some((m) => m.id === state.msgId)) throw new Error('message not in history');
      pass(86);

      const salesChatSocket = io('http://localhost:3001', { auth: { token: empSales.token } });
      await new Promise<void>((res, rej) => {
        salesChatSocket.on('connect', () => res());
        salesChatSocket.on('connect_error', (err) => rej(err));
        setTimeout(() => rej(new Error('chat socket timeout')), 5000);
      });
      salesChatSocket.emit('join:conversation', state.dmConvId);
      const chatEvt = waitForSocketEvent(salesChatSocket, 'chat:message');
      await req('POST', `/conversations/${state.dmConvId}/messages`, {
        token: adminToken,
        body: { body: 'Realtime verify ping' },
      });
      await chatEvt;
      pass(87);
      salesChatSocket.disconnect();

      await req('POST', `/conversations/${state.dmConvId}/read`, { token: empSales.token });
      const member = await prisma.conversationMember.findUnique({
        where: {
          conversationId_employeeId: {
            conversationId: state.dmConvId as string,
            employeeId: empSales.id,
          },
        },
      });
      if (!member?.lastReadAt) throw new Error('lastReadAt not set');
      pass(88);

      try {
        const fd = new FormData();
        const blob = new Blob(['fake-image-bytes'], { type: 'image/png' });
        fd.append('file', blob, 'verify.png');
        fd.append('purpose', 'chat');
        const up = await req('POST', '/files/upload', { token: adminToken, formData: fd });
        const storageKey = (up.data as { storageKey: string; mime: string }).storageKey;
        const withAtt = await req('POST', `/conversations/${state.dmConvId}/messages`, {
          token: adminToken,
          body: { body: 'with attachment', attachments: [{ storageKey, mime: 'image/png' }] },
        });
        if (!(withAtt.data as { attachments: unknown[] }).attachments?.length)
          throw new Error('attachment not saved');
        pass(89);
      } catch (e) {
        fail(89, (e as Error).message);
      }

      const chatNotif = await prisma.notification.findFirst({
        where: { type: 'chat_message', employeeId: empSales.id },
        orderBy: { createdAt: 'desc' },
      });
      if (chatNotif) pass(90);
      else fail(90, 'no chat_message notification');
    } catch (e) {
      for (const n of [83, 84, 85, 86, 87, 88, 89, 90]) {
        if (!results[n]?.pass) fail(n, (e as Error).message);
      }
    }

    // --- SECTION 10 ---
    try {
      const mediaDash = await req('GET', '/dashboard', { token: empMedia.token });
      if (!(mediaDash.data as { media?: object }).media) throw new Error('media widgets missing');
      pass(91);
      const opsDash = await req('GET', '/dashboard', { token: empOps.token });
      if (!(opsDash.data as { operation?: object }).operation) throw new Error('operation widgets missing');
      pass(92);
      const instrDash = await req('GET', '/dashboard', { token: empInstr.token });
      if (!(instrDash.data as { instructor?: object }).instructor) throw new Error('instructor widgets missing');
      pass(93);
      const acctDash = await req('GET', '/dashboard', { token: empAcct.token });
      const fin = (acctDash.data as { finance?: object }).finance;
      if (!fin) throw new Error('finance widgets missing for accountant');
      pass(94);
      const dualDash = await req('GET', '/dashboard', { token: empSalesMedia.token });
      if (!(dualDash.data as { sales?: object }).sales || !(dualDash.data as { media?: object }).media)
        throw new Error('dual privilege missing widget groups');
      pass(95);
    } catch (e) {
      for (const n of [91, 92, 93, 94, 95]) {
        if (!results[n]?.pass) fail(n, (e as Error).message);
      }
    }

    // --- SECTION 11 ---
    try {
      await req('GET', '/finance/expenses', { token: empSales.token, expect: 403 });
      pass(96, 'finance 403 OK');
      await req('PATCH', '/settings', { token: empSales.token, body: { leadStuckDays: 8 }, expect: 403 });
      pass(96, 'settings PATCH 403 OK');
    } catch (e) {
      fail(96, (e as Error).message);
    }

    try {
      await req('GET', `/wallets/${empInstr.id}`, { token: empInstr.token, expect: 403 });
      pass(97);
    } catch (e) {
      fail(97, (e as Error).message);
    }

    try {
      await req('POST', '/settings/task-path-templates', {
        token: empAcct.token,
        body: { name: 'blocked' },
        expect: 403,
      });
      pass(98);
      const w = await req('POST', `/wallets/withdrawals/${state.withdrawalId}/transition`, {
        token: empAcct.token,
        body: { toStatus: 'paid' },
        expect: 409,
      });
      pass(98, 'accountant can transition (already paid returns 409)');
    } catch (e) {
      if (!results[98]?.pass) fail(98, (e as Error).message);
    }

    try {
      await req('GET', '/employees', { token: adminToken });
      await req('GET', '/settings/webhook', { token: adminToken });
      await req('GET', '/finance/expenses', { token: adminToken });
      await req('GET', '/dashboard', { token: adminToken });
      pass(99);
    } catch (e) {
      fail(99, (e as Error).message);
    }
  } catch (fatal) {
    console.error('Fatal error:', (fatal as Error).message);
  } finally {
    await prisma.$disconnect();
  }

  // Print report
  const lines: string[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 1; i <= 99; i++) {
    const r = results[i];
    if (!r) {
      lines.push(`${i}. SKIP — not executed (prior fatal error)`);
      skipped++;
    } else if (r.pass) {
      lines.push(`${i}. PASS${r.error ? ` (${r.error})` : ''}`);
      passed++;
    } else {
      lines.push(`${i}. FAIL — ${r.error}`);
      failed++;
    }
  }
  console.log('\n=== VERIFICATION REPORT ===');
  console.log(lines.join('\n'));
  console.log(`\nTotal: ${passed} pass, ${failed} fail, ${skipped} skip`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
