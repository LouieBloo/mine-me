import React from 'react';
import type { DropTable, DropTableItem } from '@nvg/shared/types';
import { EntityPicker } from '../EntityPicker/EntityPicker';
import './DropTableEditor.css';

interface DropTableEditorProps {
  value?: Omit<DropTable, 'id'> | null;
  onChange: (val: Omit<DropTable, 'id'>) => void;
  title?: string;
  description?: string;
  errors?: Record<string, string>;
}

export const DropTableEditor: React.FC<DropTableEditorProps> = ({ 
  value, 
  onChange, 
  title = "Drop Table", 
  description,
  errors = {}
}) => {
  const current = value || { solMin: 0, solMax: 0, items: [] };

  const handleChange = (updates: Partial<Omit<DropTable, 'id'>>) => {
    onChange({ ...current, ...updates });
  };

  const addItem = () => {
    const defaultItem: Omit<DropTableItem, 'id'> = {
      itemId: '',
      chance: 10,
      minQuantity: 1,
      maxQuantity: 1,
    };
    handleChange({ items: [...current.items, defaultItem as any] });
  };

  const updateItem = (index: number, updates: Partial<DropTableItem>) => {
    const newItems = [...current.items];
    newItems[index] = { ...newItems[index], ...updates };
    handleChange({ items: newItems });
  };

  const removeItem = (index: number) => {
    const newItems = current.items.filter((_, i) => i !== index);
    handleChange({ items: newItems });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center rounded-t-xl">
        <div>
          <h4 className="text-md font-black text-slate-800 uppercase tracking-wide">{title}</h4>
          {description && <p className="text-xs font-semibold text-slate-500 mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-bold transition-colors"
        >
          + Add Item
        </button>
      </div>

      <div className="p-4 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
              Sol (Min)
            </label>
            <input
              type="number"
              min="0"
              value={current.solMin}
              onChange={(e) => handleChange({ solMin: Number(e.target.value) })}
              className={`w-full p-2 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.solMin ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-400'}`}
            />
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
              Sol (Max)
            </label>
            <input
              type="number"
              min="0"
              value={current.solMax}
              onChange={(e) => handleChange({ solMax: Number(e.target.value) })}
              className={`w-full p-2 bg-slate-50 border rounded-lg font-bold text-slate-800 transition-all ${errors.solMax ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-400'}`}
            />
          </div>
        </div>

        {current.items.length > 0 ? (
          <div className="space-y-3">
            <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest">Item Drops</h5>
            {current.items.map((item, i) => (
              <div key={item.id || i} className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-wrap gap-3 items-end relative drop-item-row group" style={{ zIndex: 50 - i }}>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200"
                >
                  &times;
                </button>
                
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Item</label>
                  <EntityPicker
                    entityType="items"
                    value={item.itemId}
                    onChange={(id) => updateItem(i, { itemId: id })}
                    placeholder="Select item..."
                  />
                </div>
                
                <div className="w-24">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Chance %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={item.chance}
                    onChange={(e) => updateItem(i, { chance: Number(e.target.value) })}
                    className="w-full p-2 bg-white border border-slate-200 rounded focus:border-blue-400 font-bold text-xs"
                  />
                </div>
                
                <div className="w-20">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Qty Min</label>
                  <input
                    type="number"
                    min="1"
                    value={item.minQuantity}
                    onChange={(e) => updateItem(i, { minQuantity: Number(e.target.value) })}
                    className="w-full p-2 bg-white border border-slate-200 rounded focus:border-blue-400 font-bold text-xs"
                  />
                </div>
                
                <div className="w-20">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Qty Max</label>
                  <input
                    type="number"
                    min="1"
                    value={item.maxQuantity}
                    onChange={(e) => updateItem(i, { maxQuantity: Number(e.target.value) })}
                    className="w-full p-2 bg-white border border-slate-200 rounded focus:border-blue-400 font-bold text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 font-medium text-sm">
            No item drops configured.
          </div>
        )}
      </div>
    </div>
  );
};
