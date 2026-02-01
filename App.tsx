
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ListenerView from './components/ListenerView';
import AdminView from './components/AdminView';
import PasswordModal from './components/PasswordModal';
import RadioPlayer from './components/RadioPlayer';
import { dbService } from './services/dbService';
import { scanNigerianNewspapers } from './services/newsAIService';
import { getDetailedBulletinAudio, getNewsAudio, getJingleAudio } from './services/aiDjService';
import { UserRole, MediaFile, AdminMessage, AdminLog, NewsItem, ListenerReport } from './types';
import { DESIGNER_NAME, APP_NAME, JINGLE_1, JINGLE_2 } from './constants';

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
  const [isShuffle, setIsShuffle] = useState(true);
  const [isDucking, setIsDucking] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string>("Global");

  const aiAudioContextRef = useRef<AudioContext | null>(null);
  const isSyncingRef = useRef(false);
  const pendingAudioRef = useRef<Uint8Array | null>(null);
  const lastBroadcastMarkerRef = useRef<string>("");

  const mediaUrlCache = useRef<Map<string, string>>(new Map());
  const playlistRef = useRef<MediaFile[]>([]);

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

    // Synchronization Channel
    const channel = new BroadcastChannel('ndr_radio_sync');
    channel.onmessage = (event) => {
      if (role === UserRole.LISTENER && event.data.type === 'PLAY_TRACK') {
        // Sync Listener to Admin's Track
        const { trackId, trackUrl, trackName } = event.data;
        setActiveTrackId(trackId);
        setActiveTrackUrl(trackUrl);
        setCurrentTrackName(trackName);
        setIsRadioPlaying(true);
      } else if (role === UserRole.LISTENER && event.data.type === 'PAUSE') {
        setIsRadioPlaying(false);
      }
    };

    return () => {
      clearTimeout(syncTimeout);
      window.removeEventListener('click', interactionHandler);
      channel.close();
    };
  }, [fetchData, currentLocation, role]);

  // Broadcast Admin Actions
  useEffect(() => {
    if (role === UserRole.ADMIN) {
      const channel = new BroadcastChannel('ndr_radio_sync');
      if (isRadioPlaying && activeTrackId) {
        channel.postMessage({
          type: 'PLAY_TRACK',
          trackId: activeTrackId,
          trackUrl: activeTrackUrl,
          trackName: currentTrackName
        });
      } else if (!isRadioPlaying) {
        channel.postMessage({ type: 'PAUSE' });
      }
      return () => channel.close();
    }
  }, [role, isRadioPlaying, activeTrackId, activeTrackUrl, currentTrackName]);

  const handlePlayNext = useCallback(async () => {
    // 1. Play Jingle (Copyright Protection / Branding)
    // We play this locally before transitioning to the next global track.
    try {
      const jingleIdx = Math.random() > 0.5 ? 1 : 2;
      const audio = await getJingleAudio(jingleIdx === 1 ? JINGLE_1 : JINGLE_2);
      if (audio) await playRawPcm(audio, 'jingle');
    } catch (e) {
      console.warn("Jingle failed", e);
    }

    // 2. Global Sync (Strict Mode)
    // After jingle, we snap to what the "Global Station" is playing right now.
    syncToGlobalTime();
  }, [audioPlaylist]);

  const handlePlayAll = () => {
    setHasInteracted(true);
    if (audioPlaylist.length === 0) {
      setIsRadioPlaying(true);
      return;
    }
    const track = isShuffle ? audioPlaylist[Math.floor(Math.random() * audioPlaylist.length)] : audioPlaylist[0];
    setActiveTrackId(track.id);
    setActiveTrackUrl(track.url);
    setCurrentTrackName(cleanTrackName(track.name));
    setIsRadioPlaying(true);
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

  /**
   * GLOBAL SYNC SYSTEM (Simulated Live Radio)
   * This forces all listeners to hear the same track at the same time based on Server Time (UTC).
   * No database required.
   */
  const syncToGlobalTime = () => {
    if (audioPlaylist.length === 0) return;

    // For Global Uniformity:
    // We assign a 3-minute slot to each track based on UTC time.
    // This ensures everyone is on the same track index at the same time.
    const SLOT_DURATION = 3 * 60 * 1000; // 3 Minutes
    const currentSlot = Math.floor(Date.now() / SLOT_DURATION);

    // Deterministic Index
    const trackIndex = currentSlot % audioPlaylist.length;

    const track = audioPlaylist[trackIndex];
    if (track) {
      console.log(`Global Sync: Cueing track #${trackIndex} for ${currentLocation}`);
      setActiveTrackId(track.id);
      setActiveTrackUrl(track.url);
      setCurrentTrackName(cleanTrackName(track.name));
      // NO AUTO-PLAY: User request. Listener must click Play.
      setIsRadioPlaying(false);
    }
  };
};

return (
  <div className="min-h-screen bg-[#f0fff4] text-[#008751] flex flex-col max-w-md mx-auto relative shadow-2xl overflow-x-hidden border-x border-green-100/30">
    <header className="p-2 sticky top-0 z-40 bg-white/90 backdrop-blur-md flex justify-between items-center border-b border-green-50 shadow-sm">
      <div className="flex flex-col">
        <h1 className="text-[11px] font-black italic uppercase leading-none text-green-950">{APP_NAME}</h1>
        <p className="text-[6px] text-green-950/60 font-black uppercase mt-0.5 tracking-widest">Designed by {DESIGNER_NAME}</p>
      </div>
      <div className="flex items-center space-x-2">
        {isDucking && <span className="text-[7px] font-black uppercase text-red-500 animate-pulse bg-red-50 px-1 rounded shadow-sm border border-red-100">Live Broadcast</span>}
        <button
          onClick={role === UserRole.ADMIN ? () => setRole(UserRole.LISTENER) : () => setShowAuth(true)}
          className="px-2 py-0.5 rounded-full border border-green-950 text-[7px] font-black uppercase text-green-950 hover:bg-green-50 transition-colors"
        >
          {role === UserRole.ADMIN ? 'Exit Admin' : 'Admin Login'}
        </button>
      </div>
    </header>

    {!hasInteracted && (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-scale-in">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto animate-bounce">
            <i className="fas fa-play text-2xl text-[#008751]"></i>
          </div>
          <h2 className="text-xl font-black text-green-950 uppercase">{APP_NAME}</h2>
          <p className="text-xs text-green-800/80 font-medium">Click below to tune in to the live broadcast and enable AI audio features.</p>
          <button
            onClick={() => {
              setHasInteracted(true);
              if (aiAudioContextRef.current) aiAudioContextRef.current.resume();

              // AUTOMATIC PLAYBACK (Global Radio Mode)
              // Instead of waiting for manual play, we jump straight into the "Live" stream
              // based on the global time calculation.
              syncToGlobalTime();

              scanNigerianNewspapers(currentLocation).then(fetchData);
            }}
            className="w-full bg-[#008751] text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-green-700 transition-all shadow-lg active:scale-95"
          >
            Start Listening (Join Live Broadcast)
          </button>
        </div>
      </div>
    )}

    <main className="flex-grow pt-1 px-1.5">
      <RadioPlayer
        onStateChange={setIsRadioPlaying}
        activeTrackUrl={activeTrackUrl}
        currentTrackName={currentTrackName}
        forcePlaying={isRadioPlaying}
        onTrackEnded={handlePlayNext}
        isDucking={isDucking}
      />

      {role === UserRole.LISTENER ? (
        <ListenerView
          news={news} onStateChange={setIsRadioPlaying} isRadioPlaying={isRadioPlaying}
          sponsoredVideos={sponsoredMedia} activeTrackUrl={activeTrackUrl}
          currentTrackName={currentTrackName} adminMessages={adminMessages} reports={reports}
          onPlayTrack={(t) => { setHasInteracted(true); setActiveTrackId(t.id); setActiveTrackUrl(t.url); setCurrentTrackName(cleanTrackName(t.name)); setIsRadioPlaying(true); }}
        />
      ) : (
        <AdminView
          onRefreshData={fetchData} logs={logs} onPlayTrack={(t) => { setHasInteracted(true); setActiveTrackId(t.id); setActiveTrackUrl(t.url); setCurrentTrackName(cleanTrackName(t.name)); setIsRadioPlaying(true); }}
          isRadioPlaying={isRadioPlaying} onToggleRadio={() => setIsRadioPlaying(!isRadioPlaying)}
          currentTrackName={currentTrackName} isShuffle={isShuffle} onToggleShuffle={() => setIsShuffle(!isShuffle)}
          onPlayAll={handlePlayAll} onSkipNext={handlePlayNext}
          onPushBroadcast={handlePushBroadcast} onPlayJingle={handlePlayJingle}
          news={news} onTriggerFullBulletin={() => runScheduledBroadcast(false)}
        />
      )}
    </main>

    {showAuth && <PasswordModal onClose={() => setShowAuth(false)} onSuccess={() => { setRole(UserRole.ADMIN); setShowAuth(false); }} />}
  </div>
);
};

export default App;
