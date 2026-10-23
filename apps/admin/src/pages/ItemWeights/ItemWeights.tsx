import { useEffect, useMemo, useState } from 'react';
import { BASE_CARRY_CAPACITY } from '@mine-me/shared';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import './ItemWeights.css';

interface Row {
  id: string;
  name: string;
  type: string;
  subType: string;
  weight: number;
}

/** Whether a typed weight can be saved: a number of 0 or more. */
export const isValidWeight = (value: string): boolean => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

/**
 * Every item with its weight, to tune them side by side against the carry capacity (base {BASE_CARRY_CAPACITY} plus the Carry
 * Capacity effect on gear). Each row saves on its own and changes nothing else about the item.
 */
export default function ItemWeights() {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchWithAuth('/api/admin/items?limit=500')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch items');
        return res.json();
      })
      .then((items: Array<Partial<Row>>) =>
        setRows(
          items
            .filter((item): item is Row => typeof item.id === 'string' && typeof item.name === 'string')
            .map((item) => ({ id: item.id, name: item.name, type: item.type ?? '', subType: item.subType ?? '', weight: typeof item.weight === 'number' ? item.weight : 0 }))
            .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
        )
      )
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? rows.filter((r) => `${r.name} ${r.type} ${r.subType}`.toLowerCase().includes(needle)) : rows;
  }, [rows, filter]);

  const save = async (row: Row) => {
    const draft = drafts[row.id];
    if (draft === undefined || !isValidWeight(draft)) return;
    setSavingId(row.id);
    try {
      const res = await fetchWithAuth(`/api/admin/items/${row.id}/weight`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight: Number(draft) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save the weight');
      }
      const saved: { weight: number } = await res.json();
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, weight: saved.weight } : r)));
      setDrafts((prev) => {
        const { [row.id]: _gone, ...rest } = prev;
        return rest;
      });
      toast.success(`${row.name} weighs ${saved.weight}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="item-weights-page space-y-6 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-end gap-4 shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">ITEM WEIGHTS</h2>
          <p className="text-slate-500 font-medium">What one unit of each item weighs in the backpack. A character with no gear carries {BASE_CARRY_CAPACITY}.</p>
        </div>
        <input
          type="search"
          aria-label="Filter items"
          placeholder="Filter by name or type"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-64 px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[300px]">
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : shown.length === 0 ? (
          <div className="flex-1 flex justify-center items-center py-24 text-slate-500 font-bold">No items match.</div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-6">Item</th>
                  <th className="py-3 px-6">Type</th>
                  <th className="py-3 px-6">Weight</th>
                  <th className="py-3 px-6 text-right">Save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {shown.map((row) => {
                  const draft = drafts[row.id];
                  const changed = draft !== undefined && draft !== String(row.weight);
                  const valid = draft === undefined || isValidWeight(draft);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-6 font-bold text-slate-900">{row.name}</td>
                      <td className="py-3 px-6 text-slate-500 font-semibold">{row.type}{row.subType ? ` / ${row.subType}` : ''}</td>
                      <td className="py-3 px-6">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`${row.name} weight`}
                          value={draft ?? String(row.weight)}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          className={`w-28 px-3 py-2 bg-slate-50 border rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800 ${valid ? 'border-slate-200' : 'border-red-400 bg-red-50'}`}
                        />
                      </td>
                      <td className="py-3 px-6 text-right">
                        <button
                          type="button"
                          disabled={!changed || !valid || savingId !== null}
                          onClick={() => void save(row)}
                          className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-all inline-flex items-center gap-2"
                        >
                          {savingId === row.id && <LoadingSpinner size={14} color="inherit" />}
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
