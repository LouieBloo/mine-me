import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Application } from '@pixi/react';
import type * as PIXI from 'pixi.js';

interface PixiStageContextValue {
  app: PIXI.Application | null;
  stageElement: HTMLDivElement | null;
}

const PixiStageContext = createContext<PixiStageContextValue>({ app: null, stageElement: null });

export function usePixiStage() {
  const context = useContext(PixiStageContext);
  if (context === undefined) {
    throw new Error('usePixiStage must be used within a PixiStageProvider');
  }
  return context;
}

interface PixiStageProviderProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
  className?: string;
  backgroundAlpha?: number;
}

/**
 * Provides a single shared PixiJS Application context to descendants.
 * This is meant to wrap an entire view or section that requires multiple sprites,
 * so they can all share one WebGL context and render loop.
 */
export function PixiStageProvider({
  children,
  width,
  height,
  className,
  backgroundAlpha = 0,
}: PixiStageProviderProps) {
  const [pixiApp, setPixiApp] = useState<any>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setStageElement(stageRef.current);
  }, []);

  return (
    <div className={`relative ${className || ''}`} style={width && height ? { width, height } : { width: '100%', height: '100%' }}>
      {/* The single PixiJS canvas for this provider */}
      <div className="absolute inset-0 z-0" ref={stageRef}>
        {stageElement && (
          <Application
            width={width}
            height={height}
            resizeTo={!width || !height ? stageElement : undefined}
            backgroundAlpha={backgroundAlpha}
            onInit={(app) => setPixiApp(app)}
          />
        )}
      </div>

      {/* Children receive the context and render their own UI elements or Pixi containers */}
      <PixiStageContext.Provider value={{ app: pixiApp, stageElement }}>
        {children}
      </PixiStageContext.Provider>
    </div>
  );
}
