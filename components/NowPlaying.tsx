import React, { useState, useEffect } from 'react';
import { StationState } from '../services/realtimeService';
import Logo from './Logo';

interface NowPlayingProps {
    state: StationState | null;
    onTogglePlay?: () => void;
    onSeek?: (time: number) => void;
    isAdmin: boolean;
    isPlaying: boolean;
    analyser?: AnalyserNode | null;
    middleContent?: React.ReactNode;
    showListenerControls?: boolean;
}

const NowPlaying: React.FC<NowPlayingProps> = ({ state, onTogglePlay, onSeek, isAdmin, isPlaying, analyser, middleContent, showListenerControls = true }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!state?.is_playing || !state?.duration || state.duration <= 0) {
            setProgress(0);
            return;
        }

        const update = () => {
            const elapsed = (Date.now() - state.started_at) / 1000;
            const p = Math.min(100, Math.max(0, (elapsed / state.duration) * 100));
            setProgress(p);
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [state?.started_at, state?.duration, state?.is_playing]);

    return (
        <div className="flex flex-col items-center w-full space-y-10">
            {/* 1. HERO NIGERIAN FLAG CARD */}
            <div className="relative w-full aspect-[4/5] rounded-[2.5rem] overflow-hidden shadow-2xl bg-white transition-all duration-700 hover:shadow-green-900/10">
                {/* Flag Background */}
                <div className="absolute inset-0 flex h-full w-full">
                    <div className="flex-1 bg-[#008751]"></div>
                    <div className="flex-1 bg-white"></div>
                    <div className="flex-1 bg-[#008751]"></div>
                </div>

                {/* Floating NDR Logo Box */}
                <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="transform scale-110">
                        <Logo size="lg" analyser={analyser} isPlaying={isPlaying} />
                    </div>
                </div>

                {/* Tagline Overlays */}
                <div className="absolute bottom-16 w-full text-center">
                    <h2 className="text-2xl font-black text-black uppercase tracking-tighter leading-none px-8">
                        NIGERIANS VOICE ABROAD
                    </h2>
                </div>
            </div>

            {/* 2. CAPSULE SLOT (Middle Content) */}
            {middleContent}

            {/* 3. CONTROLS AREA */}
            <div className="flex flex-col items-center w-full space-y-10">
                {/* Floating Play Button */}
                {showListenerControls && (
                    <div className="relative flex flex-col items-center justify-center">
                        <button
                            onClick={onTogglePlay}
                            disabled={!isAdmin && !state?.is_playing}
                            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all z-10 ${!isAdmin && !state?.is_playing
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                                    : isPlaying
                                        ? 'bg-[#f14d4d] text-white shadow-[0_10px_30px_rgba(241,77,77,0.4)]'
                                        : 'bg-[#008751] text-white shadow-[0_10px_30px_rgba(0,135,81,0.3)]'
                                }`}
                        >
                            <i className={`fas fa-${isPlaying ? 'pause' : 'play'} text-xl ${!isPlaying ? 'ml-1' : ''}`}></i>
                        </button>
                        {isPlaying && (
                            <div className="absolute inset-0 bg-[#f14d4d]/20 rounded-full scale-110 blur-xl animate-pulse"></div>
                        )}
                    </div>
                )}

                {/* Progress / Volume Slider Placeholder matching image */}
                <div className="flex items-center space-x-6 w-full px-8 opacity-60">
                    <i className="fas fa-volume-off text-[#008751] text-xs"></i>
                    <div className="flex-grow h-1 bg-green-100 rounded-full relative">
                        <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-[#008751] border-2 border-white rounded-full shadow-md"></div>
                    </div>
                    <i className="fas fa-volume-up text-[#008751] text-xs"></i>
                </div>
            </div>
        </div>
    );
};

export default NowPlaying;
