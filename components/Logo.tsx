import React from 'react';
import AudioVisualizer from './AudioVisualizer';
import { STATION_TAGLINE } from '../constants';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
  isJingle?: boolean;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', analyser, isPlaying = false, isJingle = false }) => {
  const scale = size === 'sm' ? 0.75 : size === 'lg' ? 0.95 : 0.85;

  return (
    <div className={`relative flex flex-col items-center justify-center bg-white border-[2px] p-6 rounded-[25px] shadow-[0_10px_30px_rgba(0,0,0,0.1)] transition-colors duration-500 ${isJingle ? 'border-amber-400 bg-amber-50/60' : 'border-white/60'}`} style={{ transform: `scale(${scale})` }}>
      <div className="text-center font-black leading-none drop-shadow-md">
        <div className={`text-4xl tracking-tighter drop-shadow-sm transition-colors ${isJingle ? 'text-amber-700' : 'text-[#008751]'}`}>
          NDR
        </div>
        <div className={`text-lg tracking-tighter mt-[-2px] uppercase transition-colors ${isJingle ? 'text-amber-600/80' : 'text-green-700/80'}`}>
          Radio
        </div>
      </div>
      {/* Gloss Overlay */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent rounded-t-[25px]"></div>
    </div>
  );
};

export default Logo;