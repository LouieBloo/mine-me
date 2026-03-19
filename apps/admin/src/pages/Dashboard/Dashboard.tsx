import './Dashboard.css';

export default function Dashboard() {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold mb-4">Welcome to NVG Admin</h2>
      <p className="text-slate-600">Select a configuration editor from the sidebar to begin.</p>
    </div>
  );
}
