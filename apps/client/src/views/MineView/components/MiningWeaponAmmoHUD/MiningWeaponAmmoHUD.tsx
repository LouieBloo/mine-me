import React from 'react';
import './MiningWeaponAmmoHUD.css';

export interface MiningWeaponAmmoHUDProps {
  weaponName?: string;
  weaponIconUrl?: string | null;
  currentAmmo: number;
  maxAmmo: number;
  isReloading: boolean;
  onReload?: () => void;
}

export const MiningWeaponAmmoHUD: React.FC<MiningWeaponAmmoHUDProps> = ({
  weaponName = '6-Shooter Revolver',
  weaponIconUrl = '/assets/icons/items/revolver_icon.png',
  currentAmmo,
  maxAmmo = 6,
  isReloading,
  onReload,
}) => {
  const chambers = Array.from({ length: maxAmmo }, (_, i) => i < currentAmmo);

  return (
    <div
      className="mining-weapon-ammo-hud bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex items-center gap-4 text-slate-100 pointer-events-auto select-none"
      data-testid="weapon-ammo-hud"
    >
      {/* Weapon Icon & Name */}
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center p-1 overflow-hidden shadow-inner">
          {weaponIconUrl ? (
            <img
              src={weaponIconUrl}
              alt={weaponName}
              className="w-full h-full object-contain pixelated"
            />
          ) : (
            <span className="text-xl">🔫</span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-black tracking-wider uppercase text-amber-400">
            {weaponName}
          </span>
          <span className="text-[10px] text-slate-400 font-bold uppercase">
            {isReloading ? (
              <span className="text-red-400 animate-pulse">RELOADING...</span>
            ) : currentAmmo === 0 ? (
              <span className="text-red-400">EMPTY</span>
            ) : (
              `${currentAmmo} / ${maxAmmo} ROUNDS`
            )}
          </span>
        </div>
      </div>

      {/* Revolver Cylinder Chamber Indicator */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl">
        {chambers.map((isLoaded, index) => (
          <div
            key={index}
            className={`w-3.5 h-6 rounded-sm border transition-all duration-150 flex items-center justify-center ${
              isReloading
                ? 'border-slate-700 bg-slate-800 animate-pulse'
                : isLoaded
                ? 'border-amber-400 bg-gradient-to-t from-amber-600 to-yellow-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                : 'border-slate-800 bg-slate-900/80 opacity-40'
            }`}
            data-testid={`ammo-chamber-${index}`}
            title={`Chamber ${index + 1}: ${isLoaded ? 'Loaded' : 'Spent'}`}
          >
            {isLoaded && !isReloading && (
              <div className="w-1.5 h-3 bg-yellow-100 rounded-full opacity-80" />
            )}
          </div>
        ))}
      </div>

      {/* Manual Reload Button */}
      {onReload && (
        <button
          onClick={onReload}
          disabled={isReloading || currentAmmo === maxAmmo}
          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
            isReloading || currentAmmo === maxAmmo
              ? 'opacity-40 cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500'
              : 'cursor-pointer border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 active:scale-95'
          }`}
          data-testid="manual-reload-btn"
        >
          {isReloading ? 'Reloading...' : 'Reload [R]'}
        </button>
      )}
    </div>
  );
};

export default MiningWeaponAmmoHUD;
