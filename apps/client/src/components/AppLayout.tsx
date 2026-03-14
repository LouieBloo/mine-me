import { Outlet } from 'react-router-dom';

export const AppLayout = () => {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-900 selection:bg-yellow-500/30">
      {/* Top Banner Ad Placeholder */}
      <div className="flex items-center justify-center w-full h-16 bg-slate-950 border-b border-slate-800 text-slate-600 text-sm font-semibold tracking-wider">
        ADVERTISEMENT
      </div>

      {/* Main Game Area */}
      <main className="flex-1 relative overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Banner Ad Placeholder */}
      <div className="flex items-center justify-center w-full h-16 bg-slate-950 border-t border-slate-800 text-slate-600 text-sm font-semibold tracking-wider">
        ADVERTISEMENT
      </div>
    </div>
  );
};
