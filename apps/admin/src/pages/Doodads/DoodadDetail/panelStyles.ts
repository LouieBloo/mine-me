/** Class names the Doodad editor's panels share, so they all look like the rest of the admin. */
export const inputClass = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
export const smallInputClass = 'w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
export const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';
export const hintClass = 'text-[11px] text-slate-400 font-medium';
export const panelClass = 'bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4';
export const buttonClass = 'cursor-pointer px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold text-xs rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed';
export const dangerButtonClass = 'cursor-pointer px-3 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold text-xs rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed';

/** The text of a number input: empty while it is NaN or absent. */
export const show = (n: number | null | undefined): number | '' => (typeof n === 'number' && Number.isFinite(n) ? n : '');
/** What a number input holds as a number: NaN while empty. */
export const readNumber = (raw: string): number => (raw === '' ? NaN : Number(raw));
