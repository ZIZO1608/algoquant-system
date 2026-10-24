/**
 * English dictionary: Arabic source string → English.
 *
 * A value is either a string with the same {placeholders} as its key, or a function of the
 * vars object for plurals and word order: '{n} طلاب': ({ n }) => `${n} ${n === 1 ? 'student' : 'students'}`.
 * One file per area so areas can be translated independently. `node scripts/i18n-check.mjs`
 * reports missing entries and keys whose English differs between files.
 */
import common from './common.js';
import status from './status.js';
import shell from './shell.js';
import login from './login.js';
import components from './components.js';
import dashboard from './dashboard.js';
import crm from './crm.js';
import students from './students.js';
import courses from './courses.js';
import courseDetail from './courseDetail.js';
import tasks from './tasks.js';
import finance from './finance.js';
import wallets from './wallets.js';
import reports from './reports.js';
import settings from './settings.js';
import chat from './chat.js';
import siteChats from './siteChats.js';
import evaluation from './eval.js';
import print from './print.js';
import server, { SERVER_PATTERNS } from './server.js';

export const DICTIONARIES = {
  common,
  status,
  shell,
  login,
  components,
  dashboard,
  crm,
  students,
  courses,
  courseDetail,
  tasks,
  finance,
  wallets,
  reports,
  settings,
  chat,
  siteChats,
  eval: evaluation,
  print,
  server,
};

export const SERVER_MESSAGES = server;
export { SERVER_PATTERNS };

const EN = Object.assign({}, ...Object.values(DICTIONARIES));
export default EN;
