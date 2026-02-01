import React, { useState, useEffect, useCallback, useRef } from 'react';
import ListenerView from './components/ListenerView';
import AdminView from './components/AdminView';
import PasswordModal from './components/PasswordModal';
import RadioPlayer from './components/RadioPlayer';
import { dbService } from './services/dbService';
import { scanNigerianNewspapers } from './services/newsAIService';
import { getDetailedBulletinAudio, getNewsAudio, getJingleAudio } from './services/aiDjService';
import { realtimeService } from './services/realtimeService';
import { UserRole, MediaFile, AdminMessage, AdminLog, NewsItem, ListenerReport } from './types';
import { DESIGNER_NAME, APP_NAME, JINGLE_1, JINGLE_2 } from './constants';
import { StationState } from './services/realtimeService';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>(UserRole.LISTENER);
  const [showAuth, setShowAuth] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [sponsoredMedia, setSponsoredMedia] = useState<MediaFile[]>([]);
  const [audioPlaylist, setAudioPlaylist] = useState<MediaFile[]>([]);
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  const [reports, setReports] = useState<ListenerReport[]>([]);

  const [isRadioPlaying, setIsRadioPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeTrackUrl, setActiveTrackUrl] = useState<string | null>(null);
  const [currentTrackName, setCurrentTrackName] = useState<string>('Live Stream');
  const [stationState, setStationState] = useState<StationState | null>(null);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(true);
  const [isDucking, setIsDucking] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string>("Global");
  const [currentPosition, setCurrentPosition] = useState(0); // Track current playback position in seconds
  const [activeTab, setActiveTab] = useState<'home' | 'news' | 'radio' | 'community'>('home');
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);

  const aiAudioContextRef = useRef<AudioContext | null>(null);
  const isSyncingRef = useRef(false);
  const pendingAudioRef = useRef<Uint8Array | null>(null);
  const lastBroadcastMarkerRef = useRef<string>("");

  const mediaUrlCache = useRef<Map<string, string>>(new Map());
  const playlistRef = useRef<MediaFile[]>([]);

  // Ref to track playing state without triggering re-renders of the subscription effect
  const isRadioPlayingRef = useRef(isRadioPlaying);
  const [startTime, setStartTime] = useState(0); // Add local state for the seek-to time

  useEffect(() => { isRadioPlayingRef.current = isRadioPlaying; }, [isRadioPlaying]);

  useEffect(() => {
    playlistRef.current = audioPlaylist;
    // Try to get precise location for weather
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        // We'll use coordinates for weather search grounding
        setCurrentLocation(`${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`);
      });
    }
  }, [audioPlaylist]);

  const cleanTrackName = (name: string) => {
    return name.replace(/\.(mp3|wav|m4a|aac|ogg|flac|webm|wma)$/i, '');
  };

  const fetchData = useCallback(async () => {
    try {
      const [n, l, m, msg, rep] = await Promise.all([
        dbService.getNews(), dbService.getLogs(), dbService.getMedia(), dbService.getAdminMessages(), dbService.getReports()
      ]);

      const mediaItems = m || [];
      const processedMedia = mediaItems.map(item => {
        if (item.file) {
          let url = mediaUrlCache.current.get(item.id);
          if (!url) {
            url = URL.createObjectURL(item.file);
            mediaUrlCache.current.set(item.id, url);
          }
          return { ...item, url };
        }
        return item;
      });

      setNews(n || []);
      setLogs(l || []);
      setSponsoredMedia(processedMedia.filter(item => item.type === 'video' || item.type === 'image'));
      // Sort alphabetically to ensure Global Sync works identically on all devices
      setAudioPlaylist(processedMedia.filter(item => item.type === 'audio').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
      setAdminMessages(msg || []);
      setReports(rep || []);

      if (activeTrackId) {
        const activeTrack = processedMedia.find(t => t.id === activeTrackId);
        if (activeTrack) setActiveTrackUrl(activeTrack.url);
      }
    } catch (err) {
      console.error("Data fetch error", err);
    }
  }, [activeTrackId]);

  const playRawPcm = useCallback(async (pcmData: Uint8Array, type: 'news' | 'jingle' = 'news'): Promise<void> => {
    if (!pcmData || pcmData.byteLength < 100) return Promise.resolve();

    if (!hasInteracted) {
      pendingAudioRef.current = pcmData;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        if (!aiAudioContextRef.current || aiAudioContextRef.current.state === 'closed') {
          aiAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = aiAudioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => { });

        setIsDucking(true);
        const alignedBuffer = pcmData.buffer.slice(pcmData.byteOffset, pcmData.byteOffset + pcmData.byteLength);
        const dataInt16 = new Int16Array(alignedBuffer);
        const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) {
          channelData[i] = dataInt16[i] / 32768.0;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
          setIsDucking(false);
          resolve();
        };
        source.start();
      } catch (err) {
        console.error("AI Audio Playback Error:", err);
        setIsDucking(false);
        resolve();
      }
    });
  }, [hasInteracted]);

  const runScheduledBroadcast = useCallback(async (isBrief: boolean) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      console.log(`Starting ${isBrief ? 'Headline' : 'Detailed'} News & Weather Broadcast...`);

      // Step 1: Fetch fresh data (News + Weather)
      const { news: freshNews, weather } = await scanNigerianNewspapers(currentLocation);
      await fetchData();

      if (freshNews.length > 0) {
        // Step 2: Play Intro Jingle
        const intro = await getJingleAudio(JINGLE_1);
        if (intro) await playRawPcm(intro, 'jingle');

        // Step 3: Generate and Play AI Audio
        const audioData = await getDetailedBulletinAudio({
          location: currentLocation,
          localTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          newsItems: freshNews.slice(0, 5),
          weather: weather,
          isBrief: isBrief
        });

        if (audioData) {
          await playRawPcm(audioData, 'news');
          dbService.addLog({
            id: Date.now().toString(),
            action: `${isBrief ? 'Headline' : 'Detailed'} Broadcast triggered at ${new Date().toLocaleTimeString()}`,
            timestamp: Date.now()
          });
        }

        // Step 4: Play Outro Jingle
        const outro = await getJingleAudio(JINGLE_2);
        if (outro) await playRawPcm(outro, 'jingle');
      }
    } catch (err) {
      console.error("Scheduled broadcast failed", err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [currentLocation, fetchData, playRawPcm]);

  // Precise Heartbeat Scheduler
  useEffect(() => {
    const heartbeat = setInterval(() => {
      const now = new Date();
      const currentMinute = now.getMinutes();
      const timeTag = `${now.getHours()}:${currentMinute}`;

      // :00 = Detailed News & Weather
      if (currentMinute === 0 && lastBroadcastMarkerRef.current !== timeTag) {
        lastBroadcastMarkerRef.current = timeTag;
        runScheduledBroadcast(false);
      }
      // :30 = Headline News & Weather
      else if (currentMinute === 30 && lastBroadcastMarkerRef.current !== timeTag) {
        lastBroadcastMarkerRef.current = timeTag;
        runScheduledBroadcast(true);
      }
    }, 1000); // Checking every second for precise start

    return () => clearInterval(heartbeat);
  }, [runScheduledBroadcast]);

  useEffect(() => {
    if (hasInteracted && pendingAudioRef.current) {
      const audio = pendingAudioRef.current;
      pendingAudioRef.current = null;
      playRawPcm(audio, 'news');
    }
  }, [hasInteracted, playRawPcm]);

  useEffect(() => {
    fetchData();
    // Silent initial sync
    const syncTimeout = setTimeout(() => scanNigerianNewspapers(currentLocation).then(() => fetchData()), 3000);

    const interactionHandler = () => {
      setHasInteracted(true);
      if (aiAudioContextRef.current) aiAudioContextRef.current.resume();
    };
    window.addEventListener('click', interactionHandler, { once: true });

    // REAL-TIME CLOUD SYNC
    const unsubscribe = realtimeService.subscribeToStation((state) => {
      setStationState(state);

      // If I am the Admin, I ignore updates to avoid loops or cross-admin contamination
      if (role === UserRole.ADMIN) return;

      console.log("Cloud Update Received:", state);

      if (state.is_playing && state.track_name) {
        // IDENTITY-BASED MATCHING
        const track = playlistRef.current.find(t =>
          t.id === state.track_id ||
          t.name === state.track_name
        );

        if (track) {
          setActiveTrackId(track.id);
          setActiveTrackUrl(track.url);
          setCurrentTrackName(cleanTrackName(track.name));

          const now = Date.now();
          if (state.started_at > 0 && (now - state.started_at) < 7200000) {
            const offset = Math.max(0, (now - state.started_at) / 1000);
            setStartTime(offset);
          } else {
            setStartTime(0);
          }
        } else if (state.track_url && !state.track_url.startsWith('blob:')) {
          // Fallback to track_url if provided by admin (and not a local blob)
          setActiveTrackId(state.track_id || null);
          setActiveTrackUrl(state.track_url);
          setCurrentTrackName(cleanTrackName(state.track_name));

          const now = Date.now();
          if (state.started_at > 0 && (now - state.started_at) < 7200000) {
            const offset = Math.max(0, (now - state.started_at) / 1000);
            setStartTime(offset);
          } else {
            setStartTime(0);
          }
        }

        // Always sync the playing state for listeners
        if (!state.is_playing) {
          setIsRadioPlaying(false);
        }
      } else {
        setIsRadioPlaying(false);
      }
    });

    return () => {
      clearTimeout(syncTimeout);
      window.removeEventListener('click', interactionHandler);
      unsubscribe();
    };
  }, [fetchData, currentLocation, role]); // REMOVED isRadioPlaying to prevent infinite loop

  // Broadcast Admin Actions (AdminView handles the detailed updates now)
  // We keep this simple effect just for safety if needed, but AdminView drives the bus.

  const handlePlayNext = useCallback(async () => {
    // 1. Play Jingle locally
    try {
      const jingleIdx = Math.random() > 0.5 ? 1 : 2;
      const audio = await getJingleAudio(jingleIdx === 1 ? JINGLE_1 : JINGLE_2);
      if (audio) await playRawPcm(audio, 'jingle');
    } catch (e) {
      console.warn("Jingle failed", e);
    }

    if (audioPlaylist.length === 0) return;

    let nextIndex = 0;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * audioPlaylist.length);
    } else {
      const currentIndex = audioPlaylist.findIndex(t => t.id === activeTrackId);
      nextIndex = (currentIndex + 1) % audioPlaylist.length;
    }

    const track = audioPlaylist[nextIndex];
    setActiveTrackId(track.id);
    setActiveTrackUrl(track.url);
    setCurrentTrackName(cleanTrackName(track.name));
    // RESERVOIR: Stage but don't auto-play
    // setIsRadioPlaying(true);

    if (role === UserRole.ADMIN) {
      realtimeService.updateStation({
        is_playing: true,
        track_id: track.id,
        track_name: track.name,
        track_url: track.url.startsWith('blob:') ? '' : track.url,
        started_at: Date.now(),
        updated_at: Date.now()
      });
    }
  }, [audioPlaylist, role, isShuffle, activeTrackId, playRawPcm]);

  const handlePlayPrevious = useCallback(() => {
    if (audioPlaylist.length === 0) return;
    const currentIndex = audioPlaylist.findIndex(t => t.id === activeTrackId);
    const prevIndex = currentIndex <= 0 ? audioPlaylist.length - 1 : currentIndex - 1;
    const track = audioPlaylist[prevIndex];
    setActiveTrackId(track.id);
    setActiveTrackUrl(track.url);
    setCurrentTrackName(cleanTrackName(track.name));
    // RESERVOIR: Stage but don't auto-play
    // setIsRadioPlaying(true);

    if (role === UserRole.ADMIN) {
      realtimeService.updateStation({
        is_playing: true,
        track_id: track.id,
        track_name: track.name,
        track_url: track.url.startsWith('blob:') ? '' : track.url,
        started_at: Date.now(),
        updated_at: Date.now()
      });
    }
  }, [audioPlaylist, activeTrackId, role]);

  const handlePlayAll = () => {
    setHasInteracted(true);
    if (audioPlaylist.length === 0) {
      // setIsRadioPlaying(true); 
      return;
    }
    const track = isShuffle ? audioPlaylist[Math.floor(Math.random() * audioPlaylist.length)] : audioPlaylist[0];
    setActiveTrackId(track.id);
    setActiveTrackUrl(track.url);
    setCurrentTrackName(cleanTrackName(track.name));
    // RESERVOIR: Stage but don't auto-play
    // setIsRadioPlaying(true);

    if (role === UserRole.ADMIN) {
      realtimeService.updateStation({
        is_playing: true,
        track_id: track.id,
        track_name: track.name,
        track_url: track.url.startsWith('blob:') ? '' : track.url,
        started_at: Date.now(),
        updated_at: Date.now()
      });
    }
  };

  const handlePushBroadcast = async (voiceText: string) => {
    if (voiceText.trim()) {
      const intro = await getJingleAudio(JINGLE_1);
      if (intro) await playRawPcm(intro, 'jingle');

      const audioData = await getNewsAudio(voiceText);
      if (audioData) await playRawPcm(audioData, 'news');

      const outro = await getJingleAudio(JINGLE_2);
      if (outro) await playRawPcm(outro, 'jingle');
    }
    await fetchData();
  };

  const handlePlayJingle = async (idx: number) => {
    const audio = await getJingleAudio(idx === 1 ? JINGLE_1 : JINGLE_2);
    if (audio) await playRawPcm(audio, 'jingle');
  };

  return (
    <div className="h-[100dvh] bg-[#ecf7f1] text-[#004d30] flex flex-col w-full relative overflow-hidden font-sans selection:bg-green-100 italic-none">
      {/* 1. PREMIUM HEADER */}
      <header className="px-6 py-4 sticky top-0 z-50 bg-white flex justify-between items-center premium-shadow">
        <div className="flex flex-col">
          <h1 className="text-[12px] font-black tracking-widest text-[#004d30] leading-none uppercase">{APP_NAME}</h1>
          <p className="text-[8px] text-gray-400 font-bold uppercase tracking-tight mt-1">DESIGNED BY {DESIGNER_NAME}</p>
        </div>
        <button
          onClick={role === UserRole.ADMIN ? () => setRole(UserRole.LISTENER) : () => setShowAuth(true)}
          className="capsule-border text-[9px] font-black uppercase text-[#004d30] hover:bg-green-50 transition-all active:scale-95"
        >
          {role === UserRole.ADMIN ? "LOGOUT" : "ADMIN LOGIN"}
        </button>
      </header>

      {!hasInteracted && (
        <div className="fixed inset-0 z-[100] bg-[#008751] flex flex-col items-center justify-center p-8 text-white overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
          <div className="relative z-10 text-center space-y-8 max-w-sm w-full animate-in fade-in zoom-in duration-700">
            <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl border border-white/30 animate-pulse">
              <i className="fas fa-play text-4xl ml-2"></i>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">{APP_NAME}</h2>
              <p className="text-xs font-medium text-green-50/80 leading-relaxed px-4">Tune in to the sound of home. Breaking news, sports, and Afrobeats synced worldwide.</p>
            </div>
            <button
              onClick={() => {
                setHasInteracted(true);
                if (aiAudioContextRef.current) aiAudioContextRef.current.resume();
                // Prime any existing players
                const audioElements = document.getElementsByTagName('audio');
                for (let i = 0; i < audioElements.length; i++) {
                  audioElements[i].play().then(() => audioElements[i].pause()).catch(() => { });
                }
                scanNigerianNewspapers(currentLocation).then(fetchData);
              }}
              className="w-full bg-white text-[#008751] py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-green-50 transition-all shadow-[0_20px_40px_rgba(0,0,0,0.2)] active:scale-95 group"
            >
              Enter Station <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
            </button>
          </div>
          <p className="absolute bottom-10 text-[8px] font-black uppercase tracking-[0.4em] opacity-40">Designed by {DESIGNER_NAME}</p>
        </div>
      )}

      {/* 2. MAIN CONTENT AREA */}
      <main id="main-scroll-container" className="flex-grow overflow-y-auto no-scrollbar relative scroll-smooth bg-[#ecf7f1]">
        {role === UserRole.ADMIN ? (
          <div className="p-4">
            <AdminView
              onRefreshData={fetchData} logs={logs}
              onPlayTrack={(t) => {
                setHasInteracted(true);
                setActiveTrackId(t.id);
                setActiveTrackUrl(t.url);
                setCurrentTrackName(cleanTrackName(t.name));
                // RESERVOIR: Stage but don't auto-play
                // setIsRadioPlaying(true);
                if (role === UserRole.ADMIN) {
                  realtimeService.updateStation({
                    is_playing: true,
                    track_id: t.id,
                    track_name: t.name,
                    track_url: t.url && !t.url.startsWith('blob:') ? t.url : undefined,
                    started_at: Date.now(),
                    updated_at: Date.now()
                  });
                }
              }}
              isRadioPlaying={stationState?.is_playing || false}
              onToggleRadio={() => {
                if (role === UserRole.ADMIN) {
                  realtimeService.updateStation({
                    is_playing: !(stationState?.is_playing),
                    updated_at: Date.now()
                  });
                }
              }}
              currentTrackName={currentTrackName} isShuffle={isShuffle} onToggleShuffle={() => setIsShuffle(!isShuffle)}
              onPlayAll={handlePlayAll} onSkipNext={handlePlayNext} onSkipBack={handlePlayPrevious}
              onPushBroadcast={handlePushBroadcast} onPlayJingle={handlePlayJingle}
              news={news} onTriggerFullBulletin={() => runScheduledBroadcast(false)}
              currentPosition={currentPosition}
              stationState={stationState}
              duration={duration}
              player={
                <RadioPlayer
                  onStateChange={(playing) => {
                    setIsRadioPlaying(playing);
                    // Local play should not force cloud live state changes here
                  }}
                  activeTrackUrl={activeTrackUrl}
                  currentTrackName={currentTrackName}
                  forcePlaying={isRadioPlaying}
                  onTrackEnded={handlePlayNext}
                  onTimeUpdate={setCurrentPosition}
                  onDurationChange={setDuration}
                  startTime={startTime}
                  isDucking={isDucking}
                  role={role}
                  isAdmin={true}
                  visualOnly={false}
                  compact={true}
                  hasInteracted={hasInteracted}
                />
              }
            />
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ListenerView
              news={news} onStateChange={setIsRadioPlaying} isRadioPlaying={isRadioPlaying}
              sponsoredVideos={sponsoredMedia} activeTrackUrl={activeTrackUrl}
              currentTrackName={currentTrackName} adminMessages={adminMessages} reports={reports}
              onPlayTrack={(t) => { /* Restricted */ }}
              stationState={stationState}
            />
          </div>
        )}
      </main>

      {/* 3. PERSISTENT MINI PLAYER & NAV BAR (Admin Only) */}
      {role === UserRole.ADMIN && (
        <div className="z-40 bg-white/80 backdrop-blur-xl border-t border-green-50/50 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
          {/* Bottom Navigation */}
          <nav className="flex justify-around items-center h-16">
            <NavButton
              active={false}
              icon="terminal"
              label="Command"
              onClick={() => document.getElementById('admin-command')?.scrollIntoView({ behavior: 'smooth' })}
            />
            <NavButton
              active={false}
              icon="newspaper"
              label="News"
              onClick={() => document.getElementById('admin-news')?.scrollIntoView({ behavior: 'smooth' })}
            />
            <NavButton
              active={false}
              icon="archive"
              label="Vault"
              onClick={() => document.getElementById('admin-media')?.scrollIntoView({ behavior: 'smooth' })}
            />
            <NavButton
              active={false}
              icon="list-ul"
              label="Logs"
              onClick={() => document.getElementById('admin-logs')?.scrollIntoView({ behavior: 'smooth' })}
            />
          </nav>
        </div>
      )}

      {/* Listener Hidden Engine */}
      {role === UserRole.LISTENER && (
        <div className="hidden">
          <RadioPlayer
            onStateChange={(playing) => {
              // Listeners only update local state, never push to cloud
              setIsRadioPlaying(playing);
            }}
            activeTrackUrl={activeTrackUrl}
            currentTrackName={currentTrackName}
            forcePlaying={isRadioPlaying}
            onTrackEnded={() => {
              // Listeners do NOT auto-advance. They wait for Admin's cloud sync.
              console.log("Track ended for listener, waiting for Admin sync...");
              setIsRadioPlaying(false);
            }}
            onTimeUpdate={setCurrentPosition}
            onDurationChange={setDuration}
            startTime={startTime}
            isDucking={isDucking}
            role={role}
            hasInteracted={hasInteracted}
          />
        </div>
      )}

      {showAuth && <PasswordModal onClose={() => setShowAuth(false)} onSuccess={() => { setRole(UserRole.ADMIN); setShowAuth(false); }} />}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes music-bar-1 { 0%, 100% { height: 8px; } 50% { height: 16px; } }
        @keyframes music-bar-2 { 0%, 100% { height: 12px; } 50% { height: 4px; } }
        @keyframes music-bar-3 { 0%, 100% { height: 6px; } 50% { height: 14px; } }
        .animate-music-bar-1 { animation: music-bar-1 0.8s ease-in-out infinite; }
        .animate-music-bar-2 { animation: music-bar-2 1.2s ease-in-out infinite; }
        .animate-music-bar-3 { animation: music-bar-3 1.0s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; icon: string; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center space-y-1 transition-all duration-300 ${active ? 'text-[#008751] scale-110' : 'text-gray-400 hover:text-green-600/60'}`}
  >
    <div className={`text-lg mb-0.5 ${active ? 'animate-in zoom-in-50 duration-300' : ''}`}>
      <i className={`fas fa-${icon}`}></i>
    </div>
    <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
    {active && <div className="w-1 h-1 bg-[#008751] rounded-full mt-1"></div>}
  </button>
);

export default App;
