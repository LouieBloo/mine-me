import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import './UserProfile.css';

export const UserProfile: React.FC = () => {
    const { user, logout } = useAuth();

    if (!user) {
        return (
            <div className="flex h-full w-full bg-slate-900 justify-center items-center text-white">
                Not logged in.
            </div>
        );
    }

    return (
        <div className="user-profile-container flex flex-col h-full w-full bg-slate-900 overflow-hidden items-center justify-center p-8">
            <div className="max-w-md w-full bg-panel p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
                {/* Background glow decoration */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-sol/20 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>

                <div className="flex items-center space-x-6 mb-8 relative z-10">
                    <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-sol/50 shadow-lg flex items-center justify-center">
                        <span className="text-4xl">👤</span>
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-wider uppercase">
                            {user.familyName}
                        </h2>
                        <p className="text-sol font-semibold tracking-widest text-sm uppercase">
                            Account Owner
                        </p>
                    </div>
                </div>

                <div className="space-y-4 mb-8 relative z-10">
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                        <span className="block text-slate-500 text-[10px] uppercase font-bold mb-1 tracking-widest">
                            Phone Number
                        </span>
                        <span className="text-slate-200 font-medium">
                            {user.phoneNumber}
                        </span>
                    </div>
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                        <span className="block text-slate-500 text-[10px] uppercase font-bold mb-1 tracking-widest">
                            User ID
                        </span>
                        <span className="text-slate-500 font-mono text-xs">
                            {user.id}
                        </span>
                    </div>
                </div>

                <div className="border-t border-white/5 pt-6 mt-6 flex justify-end relative z-10">
                     <button
                        onClick={logout}
                        className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-lg border border-red-500/20 transition-all active:scale-95 text-sm uppercase tracking-wider cursor-pointer"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
};
