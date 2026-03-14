import { useRef } from 'react';

export const PixiCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <div className="flex items-center justify-center w-full h-full bg-slate-900 overflow-hidden">
      <div className="w-full h-full bg-black relative">
      <div className="absolute top-4 left-4 text-white z-10 bg-slate-800/80 p-2 rounded">
        WebGL Active
      </div>
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%' }}
      />
    </div>
    </div>
  );
};
