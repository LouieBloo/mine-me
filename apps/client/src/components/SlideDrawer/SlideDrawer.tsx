import { useEffect, useState, type ReactNode } from 'react';
import './SlideDrawer.css';

interface Props {
  /** Text on the tab (read top to bottom). */
  label: string;
  /** Key that toggles the drawer (not while typing in a field). */
  hotkey?: string;
  children: ReactNode;
}

/**
 * A panel that slides in from the right edge over its container, with a tab that is always visible. It does not move the
 * content beside it. Closed, its content is not focusable.
 */
export const SlideDrawer = ({ label, hotkey, children }: Props) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hotkey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== hotkey.toLowerCase()) return;
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hotkey]);

  return (
    <div className={`slide-drawer absolute right-0 top-0 z-40 h-full ${open ? 'slide-drawer--open' : ''}`} data-open={open}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={hotkey ? `${open ? 'Close' : 'Open'} ${label} (${hotkey.toUpperCase()})` : undefined}
        className="slide-drawer__tab absolute top-1/2 -left-8 h-28 w-8 -translate-y-1/2 cursor-pointer rounded-l-lg border border-r-0 border-slate-600 bg-slate-800/95 text-[11px] font-black uppercase tracking-widest text-slate-300 shadow-xl transition-colors hover:bg-slate-700 hover:text-amber-400"
      >
        <span className="slide-drawer__label">{open ? '▸' : '◂'} {label}{hotkey ? ` (${hotkey.toUpperCase()})` : ''}</span>
      </button>
      <div className="h-full" inert={!open}>{children}</div>
    </div>
  );
};
