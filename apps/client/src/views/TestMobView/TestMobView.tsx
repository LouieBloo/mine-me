import { useEffect, useRef, useState, useCallback } from 'react';
import { Application } from '@pixi/react';
import { Application as PixiApplication } from 'pixi.js';
import { useApi } from '../../hooks/useApi';
import { MobSprite } from '../../components/game/MobSprite/MobSprite';
import { MOB_ANIMATION_KEYS } from '@nvg/shared';
import type { Mob, MobAtlas } from '@nvg/shared';
import './TestMobView.css';

/**
 * TestMobView — a dev/test page for previewing mob sprites and animations.
 * Route: /test-mob
 */
export const TestMobView = () => {
  const { fetchWithAuth } = useApi();
  const [mobs, setMobs] = useState<Mob[]>([]);
  const [selectedMobId, setSelectedMobId] = useState<string>('');
  const [selectedAnimation, setSelectedAnimation] = useState<string>(MOB_ANIMATION_KEYS[0]);
  const [extraAnimations, setExtraAnimations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pixiApp, setPixiApp] = useState<PixiApplication | null>(null);
  const mobSpriteRef = useRef<MobSprite | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track container size
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();
    const ro = new ResizeObserver(updateDimensions);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch mobs on mount
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchWithAuth('/api/game/mobs')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch mobs');
        return res.json();
      })
      .then((data: Mob[]) => {
        if (!active) return;
        setMobs(data);
        if (data.length > 0) {
          setSelectedMobId(data[0].id);
        }
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { active = false; };
  }, [fetchWithAuth]);

  // Load/reload mob sprite when selection changes
  const loadMobSprite = useCallback(async () => {
    if (!pixiApp?.stage || !selectedMobId) return;

    // Cleanup previous
    if (mobSpriteRef.current) {
      mobSpriteRef.current.destroy();
      mobSpriteRef.current = null;
    }

    const mob = mobs.find(m => m.id === selectedMobId);
    if (!mob?.animations) {
      setExtraAnimations([]);
      return;
    }

    const anims = mob.animations as MobAtlas;
    if (!anims.url || !anims.atlasUrl) {
      setExtraAnimations([]);
      return;
    }

    const baseUrl = import.meta.env.VITE_API_URL || '';
    const spriteUrl = anims.url.startsWith('http') ? anims.url : `${baseUrl}${anims.url}`;
    const atlasUrl = anims.atlasUrl.startsWith('http') ? anims.atlasUrl : `${baseUrl}${anims.atlasUrl}`;

    try {
      const mobSprite = new MobSprite(pixiApp.stage, spriteUrl, atlasUrl);
      await mobSprite.load();

      // Center and scale
      mobSprite.setPosition(dimensions.width / 2, dimensions.height / 2);

      // Auto-scale: use the first frame to figure out a good scale
      const available = mobSprite.getAvailableAnimations();
      if (available.length > 0) {
        // Calculate how big the sprite is at 1x to determine a good fit
        const maxDim = Math.min(dimensions.width, dimensions.height) * 0.6;
        mobSprite.playAnimation(selectedAnimation.length > 0 ? selectedAnimation : available[0]);

        // Access internal container to determine intrinsic size for scaling
        const wrapper = mobSprite.getContainer();
        if (wrapper.width > 0 && wrapper.height > 0) {
          const scale = Math.min(maxDim / wrapper.width, maxDim / wrapper.height, 4);
          mobSprite.setScale(scale);
        }
      }

      // Discover extra animations beyond whitelist
      const extras = available.filter(
        k => !MOB_ANIMATION_KEYS.some(wk => wk.toLowerCase() === k.toLowerCase())
      );
      setExtraAnimations(extras);

      mobSpriteRef.current = mobSprite;
    } catch (err: any) {
      console.error('[TestMobView] Failed to load mob sprite:', err);
      setError(`Failed to load sprite: ${err.message}`);
    }
  }, [pixiApp, selectedMobId, mobs, dimensions, selectedAnimation]);

  useEffect(() => {
    loadMobSprite();
    return () => {
      if (mobSpriteRef.current) {
        mobSpriteRef.current.destroy();
        mobSpriteRef.current = null;
      }
    };
  }, [pixiApp, selectedMobId, mobs, dimensions.width, dimensions.height]);

  // Switch animation when dropdown changes
  useEffect(() => {
    if (mobSpriteRef.current && selectedAnimation) {
      mobSpriteRef.current.playAnimation(selectedAnimation);
    }
  }, [selectedAnimation]);

  const selectedMob = mobs.find(m => m.id === selectedMobId);

  // Combine whitelist + extra animations for the dropdown
  const allAnimationOptions = [
    ...MOB_ANIMATION_KEYS,
    ...extraAnimations.filter(e => !MOB_ANIMATION_KEYS.some(k => k.toLowerCase() === e.toLowerCase())),
  ];

  return (
    <div className="test-mob-view">
      {/* Controls bar */}
      <div className="test-mob-controls">
        <h2 className="text-lg font-black text-white uppercase tracking-wider mr-4 flex-shrink-0">
          🧪 Mob Tester
        </h2>

        {/* Mob selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mob</label>
          <select
            value={selectedMobId}
            onChange={(e) => {
              setSelectedMobId(e.target.value);
              setSelectedAnimation(MOB_ANIMATION_KEYS[0]);
            }}
            disabled={loading}
            className="bg-slate-800 text-white border border-slate-700 rounded-lg px-4 py-2 text-sm font-bold cursor-pointer hover:border-sol/50 focus:border-sol focus:outline-none transition-colors min-w-[200px]"
          >
            {mobs.map(mob => (
              <option key={mob.id} value={mob.id}>
                {mob.name} (Lv. {mob.level})
              </option>
            ))}
          </select>
        </div>

        {/* Animation selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Animation</label>
          <select
            value={selectedAnimation}
            onChange={(e) => setSelectedAnimation(e.target.value)}
            disabled={!selectedMob?.animations}
            className="bg-slate-800 text-white border border-slate-700 rounded-lg px-4 py-2 text-sm font-bold cursor-pointer hover:border-sol/50 focus:border-sol focus:outline-none transition-colors min-w-[180px]"
          >
            {allAnimationOptions.map(key => (
              <option key={key} value={key}>
                {key}
                {!MOB_ANIMATION_KEYS.some(k => k.toLowerCase() === key.toLowerCase()) ? ' (extra)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Mob info badges */}
        {selectedMob && (
          <div className="flex items-center gap-3 ml-auto">
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">HP</span>
              <span className="text-white font-black text-sm">{selectedMob.health}</span>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">ATK</span>
              <span className="text-red-400 font-black text-sm">{selectedMob.attack}</span>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">DEF</span>
              <span className="text-blue-400 font-black text-sm">{selectedMob.defense}</span>
            </div>
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="test-mob-canvas-wrapper">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-6 py-4 text-red-400 font-bold text-sm">
              {error}
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-10 h-10 border-4 border-sol border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && mobs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-slate-500 font-bold text-lg">No mobs found. Create mobs in the Admin panel first.</div>
          </div>
        )}

        {!loading && selectedMob && !selectedMob.animations && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-slate-500 font-bold text-lg">This mob has no sprite atlas uploaded.</div>
          </div>
        )}

        {dimensions.width > 0 && dimensions.height > 0 && (
          <Application
            width={dimensions.width}
            height={dimensions.height}
            background="#020617"
            antialias={true}
            onInit={(app) => setPixiApp(app)}
          />
        )}
      </div>
    </div>
  );
};
