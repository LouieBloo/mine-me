import { Outlet, NavLink } from 'react-router-dom';
import './Layout.css';

export default function Layout() {
  const navLinkClass = ({ isActive }: { isActive: boolean }) => 
    `block px-4 py-2 mt-2 text-sm font-semibold rounded-lg ${
      isActive ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="w-64 bg-white border-r border-slate-200 shadow-sm flex flex-col">
        <div className="flex items-center justify-center h-16 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-800">NVG Admin</h1>
        </div>
        <nav className="flex-grow flex flex-col p-4 gap-2">
          <NavLink to="/" className={navLinkClass}>Dashboard</NavLink>
          <NavLink to="/cities" className={navLinkClass}>Cities Editor</NavLink>
          <NavLink to="/map-editor" className={navLinkClass}>Map Editor</NavLink>
          <NavLink to="/dungeons" className={navLinkClass}>Dungeons Editor</NavLink>
          <NavLink to="/inventory-items" className={navLinkClass}>Inventory Editor</NavLink>
          <NavLink to="/items" className={navLinkClass}>Items Editor</NavLink>
          <NavLink to="/mobs" className={navLinkClass}>Mobs Editor</NavLink>
          <NavLink to="/rates" className={navLinkClass}>Rates Editor</NavLink>
          <NavLink to="/users" className={navLinkClass}>Users Editor</NavLink>
        </nav>
      </div>
      <div className="flex-grow flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center px-6">
          <h2 className="text-lg font-semibold text-slate-700">Admin Dashboard</h2>
        </header>
        <main className="flex-grow p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
