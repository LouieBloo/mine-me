import React from 'react';
import type { ItemProjectileConfig as ProjectileConfigType } from '@mine-me/shared';
import './ItemProjectileConfig.css';

export interface ProjectileSelectableItem {
  id: string;
  name: string;
  iconUrl?: string | null;
  inGameSpriteUrl?: string | null;
  type?: string;
  subType?: string;
}

interface ItemProjectileConfigProps {
  shootsProjectiles?: boolean;
  projectileConfig?: ProjectileConfigType | null;
  availableItems?: ProjectileSelectableItem[];
  onToggleShootsProjectiles: (shoots: boolean) => void;
  onChangeConfig: (config: ProjectileConfigType | null) => void;
}

const DEFAULT_PROJECTILE_CONFIG: ProjectileConfigType = {
  magazineSize: 6,
  fireRate: 2.5,
  reloadTime: 1.5,
  projectileSpeed: 28.0,
  projectileGravityScale: 0.05,
  damage: 35,
  maxLifetime: 3.0,
  projectileItemId: '',
};

export const ItemProjectileConfig: React.FC<ItemProjectileConfigProps> = ({
  shootsProjectiles = false,
  projectileConfig,
  availableItems = [],
  onToggleShootsProjectiles,
  onChangeConfig,
}) => {
  const current: ProjectileConfigType = {
    ...DEFAULT_PROJECTILE_CONFIG,
    ...(projectileConfig || {}),
  };

  const handleToggle = (checked: boolean) => {
    onToggleShootsProjectiles(checked);
    if (checked && !projectileConfig) {
      onChangeConfig(DEFAULT_PROJECTILE_CONFIG);
    }
  };

  const update = (patch: Partial<ProjectileConfigType>) => {
    onChangeConfig({
      ...current,
      ...patch,
    });
  };

  const selectedBulletItem = availableItems.find(
    (item) => item.id === current.projectileItemId
  );

  return (
    <div className="item-projectile-config-card bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-slate-100">
      {/* Header with Checkmark Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-xl">
            🎯
          </div>
          <div>
            <h4 className="font-black text-base tracking-wide text-orange-400">
              Shoots Projectiles
            </h4>
            <p className="text-xs text-slate-400">
              Enables ballistic projectile shooting with Planck.js physics trajectory
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer self-start sm:self-auto bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 px-4 py-2 rounded-xl transition-colors">
          <input
            type="checkbox"
            checked={shootsProjectiles}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-5 h-5 rounded text-orange-500 focus:ring-orange-500 cursor-pointer accent-orange-500"
            data-testid="shoots-projectiles-checkbox"
          />
          <span className="text-xs font-black uppercase tracking-wider text-slate-200">
            Shoots Projectiles
          </span>
        </label>
      </div>

      {/* Configuration Panel - Only displayed when shootsProjectiles is checked */}
      {shootsProjectiles && (
        <div className="mt-6 space-y-6 animate-fadeIn">
          {/* Fired Projectile Item Selector */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-orange-300">
                  Fired Bullet / Projectile Item
                </label>
                <p className="text-xs text-slate-400">
                  Select the item spawned as physical projectile (e.g. Gun Bullet)
                </p>
              </div>

              {selectedBulletItem && (
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg">
                  {selectedBulletItem.iconUrl && (
                    <img
                      src={selectedBulletItem.iconUrl}
                      alt={selectedBulletItem.name}
                      className="w-6 h-6 object-contain pixelated"
                    />
                  )}
                  <span className="text-xs font-bold text-slate-200">
                    {selectedBulletItem.name}
                  </span>
                </div>
              )}
            </div>

            <select
              value={current.projectileItemId || ''}
              onChange={(e) => update({ projectileItemId: e.target.value || undefined })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm font-medium text-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer"
              data-testid="projectile-item-select"
            >
              <option value="">-- Standard Generic Bullet --</option>
              {availableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.id})
                </option>
              ))}
            </select>
          </div>

          {/* Grid of Tuning Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Magazine Size */}
            <div className="space-y-1.5 bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">
                  Magazine Size (Shots)
                </label>
                <span className="text-xs font-mono font-bold text-orange-400">
                  {current.magazineSize} rnds
                </span>
              </div>
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={current.magazineSize ?? 6}
                onChange={(e) => update({ magazineSize: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono text-slate-200 focus:border-orange-500"
                data-testid="magazine-size-input"
              />
              <p className="text-[11px] text-slate-500">
                Number of rounds fired before requiring automatic reload
              </p>
            </div>

            {/* Fire Rate */}
            <div className="space-y-1.5 bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">
                  Fire Rate (Shots/sec)
                </label>
                <span className="text-xs font-mono font-bold text-orange-400">
                  {current.fireRate} /s
                </span>
              </div>
              <input
                type="number"
                min="0.1"
                max="50"
                step="0.1"
                value={current.fireRate ?? 2.5}
                onChange={(e) => update({ fireRate: Math.max(0.1, parseFloat(e.target.value) || 0.1) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono text-slate-200 focus:border-orange-500"
                data-testid="fire-rate-input"
              />
              <p className="text-[11px] text-slate-500">
                Maximum shots permitted per second
              </p>
            </div>

            {/* Reload Time */}
            <div className="space-y-1.5 bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">
                  Reload Duration (sec)
                </label>
                <span className="text-xs font-mono font-bold text-orange-400">
                  {current.reloadTime}s
                </span>
              </div>
              <input
                type="number"
                min="0.1"
                max="60"
                step="0.1"
                value={current.reloadTime ?? 1.5}
                onChange={(e) => update({ reloadTime: Math.max(0.1, parseFloat(e.target.value) || 0.1) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono text-slate-200 focus:border-orange-500"
                data-testid="reload-time-input"
              />
              <p className="text-[11px] text-slate-500">
                Cylinder cylinder reload delay once empty
              </p>
            </div>

            {/* Projectile Speed */}
            <div className="space-y-1.5 bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">
                  Bullet Speed (tiles/sec)
                </label>
                <span className="text-xs font-mono font-bold text-orange-400">
                  {current.projectileSpeed} t/s
                </span>
              </div>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={current.projectileSpeed ?? 28}
                onChange={(e) => update({ projectileSpeed: Math.max(1, parseFloat(e.target.value) || 1) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono text-slate-200 focus:border-orange-500"
                data-testid="projectile-speed-input"
              />
              <p className="text-[11px] text-slate-500">
                Initial muzzle velocity launching projectile
              </p>
            </div>

            {/* Damage */}
            <div className="space-y-1.5 bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">
                  Impact Damage (HP)
                </label>
                <span className="text-xs font-mono font-bold text-orange-400">
                  {current.damage} DMG
                </span>
              </div>
              <input
                type="number"
                min="0"
                max="10000"
                step="1"
                value={current.damage ?? 35}
                onChange={(e) => update({ damage: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono text-slate-200 focus:border-orange-500"
                data-testid="damage-input"
              />
              <p className="text-[11px] text-slate-500">
                Base damage dealt to mobs or mine blocks on impact
              </p>
            </div>

            {/* Gravity Scale */}
            <div className="space-y-1.5 bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">
                  Gravity Scale
                </label>
                <span className="text-xs font-mono font-bold text-orange-400">
                  {current.projectileGravityScale}
                </span>
              </div>
              <input
                type="number"
                min="0"
                max="5"
                step="0.01"
                value={current.projectileGravityScale ?? 0.05}
                onChange={(e) => update({ projectileGravityScale: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono text-slate-200 focus:border-orange-500"
                data-testid="gravity-scale-input"
              />
              <p className="text-[11px] text-slate-500">
                Bullet drop trajectory influence (0 = direct laser line)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemProjectileConfig;
