import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { trackName } from '../utils/formatters';
import { canAccessPath } from '../utils/navAccess';
import { statusInfo } from '../utils/statusMaps';
import { BookIcon, GraduationIcon, SearchIcon, TasksIcon, UsersIcon } from './icons';

const LIMIT_PER_GROUP = 5;

// Letters that search folds to, written as code points so they are not taken for UI text.
const ALEF = String.fromCodePoint(0x627); // ا
const HEH = String.fromCodePoint(0x647); // ه
const YEH = String.fromCodePoint(0x64a); // ي

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ْ]/g, '') // strip Arabic diacritics
    .replace(/[أإآ]/g, ALEF)
    .replace(/ة/g, HEH)
    .replace(/ى/g, YEH);
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { leads, courses, students, tasks, hasPrivilege } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const rootRef = useRef(null);

  const groups = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    const hit = (...fields) => fields.some((f) => norm(f).includes(q));
    const out = [];
    if (canAccessPath('/crm', hasPrivilege)) {
      const items = leads
        .filter((l) => hit(l.fullName, l.phone, l.requestedCourseText))
        .slice(0, LIMIT_PER_GROUP)
        .map((l) => ({
          id: `lead-${l.id}`,
          title: l.fullName,
          sub: l.phone,
          badge: statusInfo('lead', l.status),
          href: `/crm/${l.id}`,
        }));
      if (items.length) out.push({ key: 'leads', label: t('العملاء المحتملون'), icon: UsersIcon, items });
    }
    {
      const items = courses
        .filter((c) => hit(c.name, c.track?.nameAr, trackName(c.track), c.primaryInstructor?.fullName))
        .slice(0, LIMIT_PER_GROUP)
        .map((c) => ({
          id: `course-${c.id}`,
          title: c.name,
          sub: trackName(c.track) || c.primaryInstructor?.fullName || '',
          badge: statusInfo('course', c.status),
          href: `/courses/${c.id}`,
        }));
      if (items.length) out.push({ key: 'courses', label: t('الدورات'), icon: BookIcon, items });
    }
    if (canAccessPath('/students', hasPrivilege)) {
      const items = students
        .filter((s) => hit(s.fullName, s.phone, s.email))
        .slice(0, LIMIT_PER_GROUP)
        .map((s) => ({
          id: `student-${s.id}`,
          title: s.fullName,
          sub: s.phone || s.email || '',
          href: `/students/${s.id}`,
        }));
      if (items.length) out.push({ key: 'students', label: t('الطلاب'), icon: GraduationIcon, items });
    }
    {
      const items = tasks
        .filter((task) => hit(task.title, task.course?.name, task.assignedEmployee?.fullName))
        .slice(0, LIMIT_PER_GROUP)
        .map((task) => ({
          id: `task-${task.id}`,
          title: task.title,
          sub: task.course?.name || '',
          badge: statusInfo('task', task.status),
          href: task.courseId ? `/courses/${task.courseId}` : '/tasks',
        }));
      if (items.length) out.push({ key: 'tasks', label: t('المهام'), icon: TasksIcon, items });
    }
    return out;
  }, [query, leads, courses, students, tasks, hasPrivilege, t]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // "/" focuses the search unless the user is typing somewhere else
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      const editable = document.activeElement?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = useCallback(
    (item) => {
      if (!item) return;
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
      navigate(item.href);
    },
    [navigate]
  );

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter') && query) setOpen(true);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showPanel = open && query.trim().length > 0;
  let runningIndex = -1;

  return (
    <div className="gsearch" ref={rootRef} role="combobox" aria-expanded={showPanel} aria-haspopup="listbox">
      <span className="gsearch-icon" aria-hidden="true">
        <SearchIcon size={18} />
      </span>
      <input
        ref={inputRef}
        type="search"
        className="gsearch-input"
        placeholder={t('بحث عن عميل، دورة، طالب أو مهمة…')}
        aria-label={t('بحث عام')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <kbd className="kbd gsearch-kbd" aria-hidden="true">/</kbd>

      {showPanel && (
        <div className="gsearch-panel" role="listbox">
          {groups.length === 0 ? (
            <div className="gsearch-empty">{t('لا نتائج لـ «{query}»', { query: query.trim() })}</div>
          ) : (
            groups.map((g) => {
              const GroupIcon = g.icon;
              return (
                <div key={g.key} className="gsearch-group">
                  <div className="gsearch-group-head">
                    <GroupIcon size={14} />
                    <span>{g.label}</span>
                    <span className="gsearch-group-count">{g.items.length}</span>
                  </div>
                  {g.items.map((item) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        role="option"
                        aria-selected={idx === active}
                        className={`gsearch-item ${idx === active ? 'is-active' : ''}`}
                        onMouseEnter={() => setActive(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(item)}
                      >
                        <span className="gsearch-item-text">
                          <span className="gsearch-item-title">{item.title}</span>
                          {item.sub && <span className="gsearch-item-sub ltr">{item.sub}</span>}
                        </span>
                        {item.badge && <span className={`badge plain tone-${item.badge.tone}`}>{item.badge.label}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
          <div className="gsearch-foot">
            <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> {t('للتنقل')}</span>
            <span><kbd className="kbd">Enter</kbd> {t('للفتح')}</span>
            <span><kbd className="kbd">Esc</kbd> {t('للإغلاق')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
