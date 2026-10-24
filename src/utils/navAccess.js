/** Privilege rules for sidebar + route guards (mirrors backend access). */

export const NAV_ACCESS = {
  '/': null, // all authenticated
  '/crm': ['admin', 'sales'],
  '/courses': null,
  '/tasks': null,
  '/students': ['admin', 'operation', 'sales', 'accountant'],
  '/employee-wallets': null,
  '/finance': ['admin', 'accountant'],
  '/reports': ['admin', 'sales', 'operation', 'accountant', 'instructor'],
  '/settings': ['admin'],
  '/chat': null,
  '/site-chats': null, // website bot conversations: every employee
};

export function canAccessPath(path, hasPrivilege) {
  if (!path) return true;
  const base = '/' + String(path).split('/').filter(Boolean)[0];
  const key = base === '/' ? '/' : base;
  const required = NAV_ACCESS[key];
  if (!required) return true;
  return required.some((code) => hasPrivilege(code));
}

export function firstAllowedPath(hasPrivilege) {
  const order = [
    '/',
    '/crm',
    '/courses',
    '/tasks',
    '/students',
    '/employee-wallets',
    '/finance',
    '/reports',
    '/settings',
    '/chat',
    '/site-chats',
  ];
  for (const path of order) {
    if (canAccessPath(path, hasPrivilege)) return path;
  }
  return '/';
}
