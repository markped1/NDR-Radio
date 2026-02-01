
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
  isAdmin?: boolean;
  role?: UserRole;
  isDucking?: boolean;
}

const RadioPlayer: React.FC<RadioPlayerProps> = ({
  onStateChange,
  activeTrackUrl,
  currentTrackName = 'Live Stream',
  forcePlaying = false,
  onTrackEnded,
  role = UserRole.LISTENER,
  isDucking = false
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
  useEffect(() => {
    onTrackEndedRef.current = onTrackEnded;
  }, [onTrackEnded]);

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
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));

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
        audioRef.current.play().catch(() => setStatus('ERROR'));
      } else if (!forcePlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [forcePlaying]);

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
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-2 w-full">
      <Logo size="lg" analyser={analyser} isPlaying={isPlaying} />

      <div className="w-[80%] mt-4 relative z-20">
        <div className="h-1.5 w-full bg-green-100/50 rounded-full overflow-hidden backdrop-blur-sm border border-green-50">
          <div className="h-full bg-[#008751] transition-all duration-300 shadow-[0_0_10px_#008751]" style={{ width: `${progress}%` }}></div>
        </div>
        {duration > 0 && isFinite(duration) && (
          <div className="flex justify-between mt-1 px-1">
            <span className="text-[7px] font-bold text-green-800">{formatTime(currentTime)}</span>
            <span className="text-[7px] font-bold text-green-800">{formatTime(duration)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center space-y-3 relative z-20 w-full px-12">
        {/* Simplified Static Track Info Display with "NOW PLAYING:" prefix */}
        <div className="bg-[#008751]/10 px-4 py-2 rounded-full border border-green-200/50 w-full overflow-hidden shadow-inner flex items-center justify-center text-center">
          <span className="text-[7px] font-black uppercase text-green-800 tracking-widest line-clamp-1">
            NOW PLAYING: {currentTrackName}
          </span>
        </div>

        <button
          onClick={() => {
            if (!audioRef.current) return;
            initAudioContext();
            if (isPlaying) audioRef.current.pause();
            else audioRef.current.play().catch(() => setStatus('ERROR'));
          }}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(0,135,81,0.4)] transition-all active:scale-95 bg-[#008751] hover:bg-[#007043] border-[3px] border-white/20`}
          disabled={status === 'LOADING'}
        >
          {status === 'LOADING' ? (
            <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : isPlaying ? (
            /* Pause Icon (Two Stripes) */
            <svg className="w-8 h-8 text-white fill-current" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            /* Play Icon (Forward Arrow) */
            <svg className="w-8 h-8 text-white fill-current ml-1" viewBox="0 0 24 24">
              <path d="M5.5 3.5L20.5 12L5.5 20.5V3.5Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="w-32 flex items-center space-x-2">
          <i className="fas fa-volume-down text-green-600 text-[8px]"></i>
          <input
            type="range" min="0" max="1" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-grow h-0.5 bg-green-100 rounded-lg appearance-none accent-[#008751]"
          />
          <i className="fas fa-volume-up text-green-600 text-[8px]"></i>
        </div>

        {/* Debug: Fallback Warning */}
        {isPlaying && activeTrackUrl === DEFAULT_STREAM_URL && (
          <p className="text-[7px] text-red-500 font-bold bg-white/80 px-2 py-1 rounded-full mt-2 animate-pulse">
            Offline: Using Internet Stream (Might Fail)
          </p>
        )}
      </div>
    </div>
  );
};

export default RadioPlayer;
