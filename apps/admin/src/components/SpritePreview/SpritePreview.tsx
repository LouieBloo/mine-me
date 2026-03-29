import { useEffect, useRef, useState } from 'react';
import { Application, Assets, AnimatedSprite, Spritesheet, Texture, Container, Text, TextStyle } from 'pixi.js';
import './SpritePreview.css';

interface SpritePreviewProps {
  spriteUrl: string;
  atlasUrl: string;
  animationKeys: string[];
  whitelistedKeys: string[];
}

const CELL_WIDTH = 160;
const CELL_HEIGHT = 200;
const LABEL_HEIGHT = 28;
const PADDING = 16;
const COLS = 4;

export default function SpritePreview({ spriteUrl, atlasUrl, animationKeys, whitelistedKeys }: SpritePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !spriteUrl || !atlasUrl || spriteUrl.includes('undefined') || atlasUrl.includes('undefined') || animationKeys.length === 0) {
      setLoading(false);
      return;
    }

    let destroyed = false;
    let pixiApp: Application | null = null;

    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        const cols = Math.min(animationKeys.length, COLS);
        const rows = Math.ceil(animationKeys.length / COLS);
        const canvasW = cols * (CELL_WIDTH + PADDING) + PADDING;
        const canvasH = rows * (CELL_HEIGHT + PADDING) + PADDING;

        pixiApp = new Application();
        await pixiApp.init({
          backgroundAlpha: 0,
          antialias: false,
          roundPixels: true,
          width: canvasW,
          height: canvasH,
        });

        if (destroyed) { pixiApp.destroy(); return; }

        appRef.current = pixiApp;
        containerRef.current!.appendChild(pixiApp.canvas);

        // Load texture
        const cacheKey = `atlas_sprite_${Date.now()}`;
        const texture = await Assets.load({ src: spriteUrl, alias: cacheKey });

        if (destroyed) { pixiApp.destroy(); return; }

        // Fetch & patch atlas JSON
        const response = await fetch(atlasUrl);
        if (!response.ok) throw new Error(`Failed to fetch atlas: ${response.status}`);
        const atlasData = await response.json();

        if (atlasData.meta) {
          atlasData.meta.image = spriteUrl;
        }

        const sheet = new Spritesheet(texture, atlasData);
        await sheet.parse();

        if (destroyed) { pixiApp.destroy(); return; }

        // Render each animation in its own cell
        animationKeys.forEach((key, index) => {
          const col = index % COLS;
          const row = Math.floor(index / COLS);
          const cellX = PADDING + col * (CELL_WIDTH + PADDING);
          const cellY = PADDING + row * (CELL_HEIGHT + PADDING);

          const cellContainer = new Container();
          cellContainer.x = cellX;
          cellContainer.y = cellY;

          // Label
          const isWhitelisted = whitelistedKeys.includes(key.toLowerCase());
          const labelStyle = new TextStyle({
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 11,
            fontWeight: 'bold',
            fill: isWhitelisted ? 0x22c55e : 0xf59e0b,
            align: 'center',
          });
          const label = new Text({ text: key, style: labelStyle });
          label.anchor.set(0.5, 0);
          label.x = CELL_WIDTH / 2;
          label.y = 0;
          cellContainer.addChild(label);

          // Get frames
          let frames: Texture[] = [];
          if (sheet.animations && sheet.animations[key]) {
            frames = sheet.animations[key];
          } else {
            // Try case-insensitive match
            const match = Object.keys(sheet.animations || {}).find(
              k => k.toLowerCase() === key.toLowerCase()
            );
            if (match) frames = sheet.animations![match];
          }

          if (frames && frames.length > 0) {
            const anim = new AnimatedSprite(frames);
            anim.anchor.set(0.5);
            anim.animationSpeed = 0.15;

            // Scale to fit within the cell area below the label
            const availW = CELL_WIDTH - 8;
            const availH = CELL_HEIGHT - LABEL_HEIGHT - 16;
            if (anim.width > 0 && anim.height > 0) {
              const scale = Math.min(availW / anim.width, availH / anim.height, 4);
              anim.scale.set(scale);
            }

            anim.x = CELL_WIDTH / 2;
            anim.y = LABEL_HEIGHT + (CELL_HEIGHT - LABEL_HEIGHT) / 2;
            anim.play();
            cellContainer.addChild(anim);
          } else {
            // Show "No frames" text
            const noFrames = new Text({
              text: '—',
              style: new TextStyle({ fontSize: 20, fill: 0x94a3b8 }),
            });
            noFrames.anchor.set(0.5);
            noFrames.x = CELL_WIDTH / 2;
            noFrames.y = LABEL_HEIGHT + (CELL_HEIGHT - LABEL_HEIGHT) / 2;
            cellContainer.addChild(noFrames);
          }

          pixiApp!.stage.addChild(cellContainer);
        });

        setLoading(false);
      } catch (err: any) {
        console.error('[SpritePreview] Error:', err);
        setError(err.message || 'Failed to load animations');
        setLoading(false);
      }
    };

    init();

    return () => {
      destroyed = true;
      if (pixiApp) {
        pixiApp.destroy(true, { children: true, texture: false });
      }
      appRef.current = null;
    };
  }, [spriteUrl, atlasUrl, animationKeys, whitelistedKeys]);

  return (
    <div className="sprite-preview-unified" ref={containerRef}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 backdrop-blur-sm z-20">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      
      {error && (
        <div className="p-4 text-center text-red-500 font-bold text-sm bg-red-50 rounded-lg border border-red-100 z-20">
          {error}
        </div>
      )}
    </div>
  );
}
