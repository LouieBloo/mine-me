import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import './MiningConfigHeader.css';

interface MiningConfigHeaderProps {
  saving: boolean;
  resetting: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
  onDismissError: () => void;
}

export default function MiningConfigHeader({
  saving,
  resetting,
  error,
  onSave,
  onReset,
  onDismissError,
}: MiningConfigHeaderProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">MINE GENERATOR CONFIG</h2>
          <p className="text-slate-500 font-medium">
            Fine-tune procedural caves, subterranean caverns, winding tunnels, and resource distribution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={resetting || saving}
            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || resetting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <LoadingSpinner size={16} color="inherit" />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="text-red-500 hover:text-red-700 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
