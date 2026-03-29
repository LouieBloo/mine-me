import React, { useState, useEffect, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';

interface EntityPickerProps {
    entityType: 'cities' | 'mobs' | 'items' | 'dungeons' | 'users' | 'inventory-items' | 'characters';
    value: string;
    onChange: (id: string, item?: any) => void;
    error?: string;
    placeholder?: string;
}

export const EntityPicker: React.FC<EntityPickerProps> = ({ entityType, value, onChange, error, placeholder }) => {
    const { fetchWithAuth } = useApi();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [displayValue, setDisplayValue] = useState<string>('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Initial fetch to get the display name of the selected value if exists
    useEffect(() => {
        if (value) {
            fetchWithAuth(`/api/admin/${entityType}/${value}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        setDisplayValue(data.name || data.familyName || data.id);
                    }
                })
                .catch(() => setDisplayValue(value));
        } else {
            setDisplayValue('');
        }
    }, [value, entityType]);

    // Fetch data when dropdown opens or search changes
    const fetchItems = async (isNewSearch = false) => {
        setLoading(true);
        const currentPage = isNewSearch ? 1 : page;
        try {
            const res = await fetchWithAuth(`/api/admin/${entityType}?search=${encodeURIComponent(search)}&page=${currentPage}&limit=50`);
            const data = await res.json();
            if (isNewSearch) {
                setItems(data);
            } else {
                setItems(prev => [...prev, ...data]);
            }
            setHasMore(data.length === 50);
            setPage(currentPage + 1);
        } catch (err) {
            console.error("Failed to fetch elements for picker", err);
        } finally {
            setLoading(false);
        }
    };

    // Debounce search
    useEffect(() => {
        if (!open) return;
        const to = setTimeout(() => {
            fetchItems(true);
        }, 300);
        return () => clearTimeout(to);
    }, [search, open, entityType]);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelect = (item: any) => {
        onChange(item.id, item);
        setDisplayValue(item.name || item.familyName || item.id);
        setOpen(false);
        setSearch('');
    };

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <div 
                className={`w-full p-3 bg-slate-50 border rounded-lg font-bold text-slate-800 cursor-pointer flex justify-between items-center transition-all ${error ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'border-slate-200 hover:border-blue-400'}`}
                onClick={() => setOpen(!open)}
            >
                <span className={displayValue ? '' : 'text-slate-400'}>{displayValue || placeholder || `Select ${entityType}...`}</span>
                <svg className={`w-5 h-5 transition-transform ${open ? 'rotate-180 text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
            
            {open && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-80 flex flex-col overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <input
                            type="text"
                            autoFocus
                            placeholder="Type to search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full p-2 text-sm bg-white border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
                        {items.length === 0 && !loading && (
                            <div className="p-4 text-center text-slate-400 text-sm font-medium">No results found.</div>
                        )}
                        
                        {items.map(item => (
                            <div 
                                key={item.id} 
                                onClick={() => handleSelect(item)}
                                className={`p-3 text-sm font-bold rounded-lg cursor-pointer transition-colors ${value === item.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}`}
                            >
                                {item.name || item.familyName || item.id}
                                <div className="text-xs font-normal text-slate-400 font-mono mt-0.5">{item.id}</div>
                            </div>
                        ))}
                        
                        {loading && (
                            <div className="p-4 w-full flex justify-center"><LoadingSpinner size={24} /></div>
                        )}
                        
                        {hasMore && !loading && items.length > 0 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); fetchItems(false); }}
                                className="w-full p-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded transition-colors mt-1"
                            >
                                Load More...
                            </button>
                        )}
                    </div>
                </div>
            )}
            
            {error && (
                <p className="text-red-500 text-xs font-bold mt-1 tracking-wide">{error}</p>
            )}
        </div>
    );
};
