
import React, { useState, useRef, useEffect } from 'react';
import { DEFAULT_STREAM_URL } from '../constants';
import { UserRole } from '../types';
import Logo from './Logo';

interface RadioPlayerProps {
  onStateChange: (isPlaying: boolean) => void;
  activeTrackUrl?: string | null;
  currentTrackName?: string;
  forcePlaying?: boolean;
  onTrackEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  startTime?: number;
  isAdmin?: boolean;
  role?: UserRole;
  isDucking?: boolean;
  visualOnly?: boolean; // New prop to show UI only, not run engine
  compact?: boolean;    // Minimal UI for Admin Midway
  hasInteracted?: boolean;
}

const RadioPlayer: React.FC<RadioPlayerProps> = ({
  onStateChange,
  activeTrackUrl,
  currentTrackName = 'Live Stream',
  forcePlaying = false,
  onTrackEnded,
  onTimeUpdate,
  onDurationChange,
  startTime = 0,
  role = UserRole.LISTENER,
  isDucking = false,
  visualOnly = false,
  compact = false,
  hasInteracted = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PLAYING' | 'ERROR'>('IDLE');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const onTrackEndedRef = useRef(onTrackEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  useEffect(() => {
    onTrackEndedRef.current = onTrackEnded;
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTrackEnded, onTimeUpdate]);

  const initAudioContext = () => {
    try {
      if (!audioRef.current) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(console.warn);
      }

      if (!gainNodeRef.current) {
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gainNodeRef.current = gain;
      }

      if (!sourceRef.current) {
        sourceRef.current = ctx.createMediaElementSource(audioRef.current);
        const newAnalyser = ctx.createAnalyser();
        newAnalyser.fftSize = 256;

        sourceRef.current.connect(newAnalyser);
        newAnalyser.connect(gainNodeRef.current!);
        setAnalyser(newAnalyser);
      }
    } catch (e) {
      console.error("Audio Initialization Failure:", e);
    }
  };

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handlePlay = () => { setStatus('PLAYING'); setIsPlaying(true); onStateChange(true); };
    const handlePause = () => { setStatus('IDLE'); setIsPlaying(false); onStateChange(false); };
    const handleError = (e: any) => {
      console.error("Audio Playback Error:", e);
      setStatus('ERROR');
      setIsPlaying(false);
      onStateChange(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', () => setStatus('LOADING'));
    audio.addEventListener('playing', handlePlay);
    audio.addEventListener('ended', () => onTrackEndedRef.current?.());
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdateRef.current?.(audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      onDurationChange?.(audio.duration);
    });

    audio.src = activeTrackUrl || DEFAULT_STREAM_URL;
    audio.crossOrigin = (audio.src.startsWith('blob:') || audio.src.startsWith('data:')) ? null : "anonymous";

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      const targetSrc = activeTrackUrl || DEFAULT_STREAM_URL;
      if (audioRef.current.src !== targetSrc) {
        const isLocal = targetSrc.startsWith('blob:') || targetSrc.startsWith('data:');
        audioRef.current.crossOrigin = isLocal ? null : "anonymous";
        audioRef.current.src = targetSrc;
        audioRef.current.load();

        if (isPlaying || forcePlaying) {
          initAudioContext();
          audioRef.current.play().catch(err => {
            console.warn("Autoplay blocked, waiting for interaction", err);
            setStatus('IDLE');
          });
        }
      }
    }
  }, [activeTrackUrl]);

  useEffect(() => {
    if (audioRef.current) {
      if (forcePlaying && audioRef.current.paused) {
        initAudioContext();

        // If we have a startTime and we are just starting, seek before playing
        if (startTime > 0 && Math.abs(audioRef.current.currentTime - startTime) > 2) {
          console.log(`Seeking to startTime: ${startTime}`);
          audioRef.current.currentTime = startTime;
        }

        audioRef.current.play().catch(() => setStatus('ERROR'));
      } else if (!forcePlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [forcePlaying, startTime]);

  useEffect(() => {
    if (forcePlaying && audioContextRef.current?.state === 'suspended') {
      initAudioContext();
    }
  }, [forcePlaying]);

  useEffect(() => {
    if (hasInteracted && forcePlaying && audioRef.current?.paused) {
      console.log("Interaction detected, attempting playback re-trigger...");
      initAudioContext();
      audioRef.current.play().catch(console.warn);
    }
  }, [hasInteracted, forcePlaying]);

  useEffect(() => {
    const targetGain = isDucking ? volume * 0.15 : volume;
    if (gainNodeRef.current && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      gainNodeRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.1);
    } else if (audioRef.current) {
      audioRef.current.volume = targetGain;
    }
  }, [volume, isDucking]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const formatTime = (time: number) => {
    if (!isFinite(time)) return "--:--";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // If this is the hidden engine, we return null or minimal
  if (visualOnly === false && role === UserRole.LISTENER && !forcePlaying && !activeTrackUrl) {
    // Hidden engine should still exist to catch global events, but we can skip render
  }

  // If this is the VISUAL representation
  if (compact) {
    return (
      <div className="w-full bg-green-50/30 rounded-2xl p-4 border border-green-100/50 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPlaying ? 'bg-[#008751] text-white animate-pulse' : 'bg-gray-200 text-gray-400'}`}>
            <i className={`fas fa-${isPlaying ? 'volume-up' : 'volume-mute'} text-[10px]`}></i>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-green-950 truncate max-w-[120px]">{currentTrackName}</p>
            <p className="text-[7px] font-bold text-green-600 uppercase tracking-widest">{status}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[9px] font-black text-green-900 mono">{formatTime(currentTime)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); initAudioContext(); if (isPlaying) audioRef.current?.pause(); else audioRef.current?.play(); }}
            className="w-8 h-8 rounded-full bg-white border border-green-100 flex items-center justify-center shadow-sm active:scale-90"
          >
            <i className={`fas fa-${isPlaying ? 'pause' : 'play'} text-[10px] text-[#008751]`}></i>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full px-6 py-8 animate-in fade-in zoom-in duration-500">
      {/* 1. ARTWORK / LOGO SECTION */}
      <div className="relative mb-12 group">
        <div className="absolute inset-0 bg-green-500/20 blur-[60px] rounded-full group-hover:bg-green-500/30 transition-all duration-700"></div>
        <div className="relative z-10 w-64 h-64 bg-white rounded-[3rem] shadow-2xl flex items-center justify-center border border-green-50 overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
          <Logo size="xl" analyser={analyser} isPlaying={isPlaying} />
          {isPlaying && (
            <div className="absolute bottom-4 flex space-x-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`w-1 bg-[#008751] rounded-full animate-music-bar-${(i % 3) + 1}`} style={{ height: '12px' }}></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. TRACK INFO */}
      <div className="text-center space-y-2 mb-10 w-full max-w-xs">
        <h2 className="text-xl font-black text-green-950 uppercase tracking-tight line-clamp-2 leading-tight">
          {currentTrackName}
        </h2>
        <div className="flex items-center justify-center space-x-2">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
          <span className="text-[9px] font-black text-green-600/60 uppercase tracking-[0.3em]">Live from Lagos</span>
        </div>
      </div>

      {/* 3. PROGRESS BAR */}
      <div className="w-full mb-10 space-y-2">
        <div className="relative h-2 bg-green-100 rounded-full overflow-hidden shadow-inner cursor-pointer group">
          <div
            className="absolute top-0 left-0 h-full bg-[#008751] transition-all duration-300 shadow-[0_0_15px_rgba(0,135,81,0.5)]"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="flex justify-between px-1">
          <span className="text-[9px] font-black text-green-900 mono">{formatTime(currentTime)}</span>
          <span className="text-[9px] font-black text-green-900/40 mono">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 4. MAIN CONTROLS */}
      <div className="flex items-center justify-center space-x-10 mb-12">
        <button className="text-gray-400 hover:text-green-600 transition-colors">
          <i className="fas fa-backward-step text-xl"></i>
        </button>

        <button
          onClick={() => {
            if (!audioRef.current) return;
            initAudioContext();
            if (isPlaying) audioRef.current.pause();
            else audioRef.current.play().catch(() => setStatus('ERROR'));
          }}
          className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-green-900/20 transition-all active:scale-95 bg-[#008751] hover:bg-[#007043] border-4 border-white group`}
          disabled={status === 'LOADING'}
        >
          {status === 'LOADING' ? (
            <svg className="animate-spin h-10 w-10 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : isPlaying ? (
            <i className="fas fa-pause text-3xl text-white"></i>
          ) : (
            <i className="fas fa-play text-3xl text-white ml-2"></i>
          )}
        </button>

        <button className="text-gray-400 hover:text-green-600 transition-colors">
          <i className="fas fa-forward-step text-xl"></i>
        </button>
      </div>

      {/* 5. VOLUME SLIDER */}
      <div className="w-full flex items-center space-x-4 px-8 opacity-60 hover:opacity-100 transition-opacity">
        <i className="fas fa-volume-off text-xs text-green-950"></i>
        <div className="flex-grow relative h-1 bg-green-100 rounded-full overflow-hidden">
          <input
            type="range" min="0" max="1" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="absolute top-0 left-0 h-full bg-[#008751]" style={{ width: `${volume * 100}%` }}></div>
        </div>
        <i className="fas fa-volume-up text-xs text-green-950"></i>
      </div>

      {/* 6. STATUS INDICATOR */}
      {isPlaying && activeTrackUrl === DEFAULT_STREAM_URL && (
        <div className="mt-10 px-4 py-1.5 bg-red-50 text-red-600 rounded-full border border-red-100 flex items-center space-x-2 animate-bounce">
          <i className="fas fa-wifi text-[8px]"></i>
          <span className="text-[8px] font-black uppercase tracking-widest">Internet Stream</span>
        </div>
      )}
    </div>
  );
};

export default RadioPlayer;
