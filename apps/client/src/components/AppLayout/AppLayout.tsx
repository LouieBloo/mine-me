import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './AppLayout.css';

export const AppLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Hide the floating profile button if we are on one of the main in-game routes 
  // where the right sidebar is visible and displays these buttons.
  const isGameView = ['/home', '/combat', '/training', '/mine'].some(
    path => location.pathname.startsWith(path)
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-900 selection:bg-yellow-500/30">
      {/* Top Banner Ad Placeholder */}
      <div className="flex items-center justify-center w-full h-16 bg-slate-950 border-b border-slate-800 text-slate-600 text-sm font-semibold tracking-wider flex-shrink-0">
        ADVERTISEMENT
      </div>

      {/* Main Game Area */}
      <main className="flex-1 relative overflow-y-auto w-full">
        {/* Top-right Profile Button */}
        {user && !isGameView && (
          <button 
            onClick={() => navigate('/profile')}
            className="absolute top-4 right-8 z-50 flex items-center space-x-3 bg-slate-900/80 hover:bg-slate-800 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10 shadow-lg text-white group transition-all"
          >
            <span className="font-bold tracking-wider uppercase text-sm group-hover:text-sol transition-colors">
              {user.familyName}
            </span>
            <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-600 group-hover:border-sol flex flex-shrink-0 items-center justify-center transition-colors">
              <span className="text-sm">👤</span>
            </div>
          </button>
        )}

        <Outlet />
      </main>

      {/* Bottom Banner Ad Placeholder */}
      <div className="flex items-center justify-center w-full h-16 bg-slate-950 border-t border-slate-800 text-slate-600 text-sm font-semibold tracking-wider flex-shrink-0">
        ADVERTISEMENT
      </div>
    </div>
  );
};
