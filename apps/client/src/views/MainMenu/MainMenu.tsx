import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import './MainMenu.css';

export const MainMenu = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { activeCharacter } = useGame();

  useEffect(() => {
    if (token) {
      if (activeCharacter) {
        navigate('/home', { replace: true });
      } else {
        navigate('/characters', { replace: true });
      }
    }
  }, [token, activeCharacter, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-100">
      <div className="text-center p-8 bg-slate-800 rounded-lg shadow-2xl border border-slate-700 max-w-md w-full">
        <h1 className="text-5xl font-black mb-2 text-yellow-500 drop-shadow-md tracking-wider">
          NEED VS. GREED
        </h1>
        <p className="text-slate-400 mb-10 text-lg">A treacherous MMORPG adventure.</p>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate('/home')}
            className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 text-slate-900 font-bold text-xl rounded transition-colors shadow-lg cursor-pointer"
          >
            Play Game
          </button>
          <button className="px-6 py-3 font-bold text-slate-300 transition-all bg-slate-800 rounded-lg hover:bg-slate-700 hover:text-white hover:scale-105 active:scale-95 shadow-lg cursor-pointer">
            Leaderboards
          </button>
          <button className="px-6 py-3 font-bold text-slate-400 transition-all border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-white hover:scale-105 active:scale-95 cursor-pointer">
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};
