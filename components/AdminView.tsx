import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/dbService';
import { realtimeService } from '../services/realtimeService';
import { AdminLog, MediaFile, NewsItem, ListenerReport } from '../types';
import NowPlaying from './NowPlaying';

interface AdminViewProps {
  onRefreshData: () => void;
  logs: AdminLog[];
  onPlayTrack: (track: MediaFile) => void;
  isRadioPlaying: boolean;
  onToggleRadio: () => void;
  currentTrackName: string;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  onPlayAll: () => void;
  onSkipNext: () => void;
  onPushBroadcast?: (voiceText: string) => Promise<void>;
  onPlayJingle?: (index: 1 | 2) => Promise<void>;
  news?: NewsItem[];
  onTriggerFullBulletin?: () => Promise<void>;
  currentPosition: number;
  stationState: any; // Add stationState prop
  duration: number;   // Add duration prop
}

type Tab = 'command' | 'bulletin' | 'media' | 'inbox' | 'logs';
type MediaSubTab = 'audio' | 'video';

const AdminView: React.FC<AdminViewProps> = ({
  onRefreshData,
  logs,
  onPlayTrack,
  isRadioPlaying,
  onToggleRadio,
  currentTrackName,
  onPlayAll,
  onPushBroadcast,
  onPlayJingle,
  news = [],
  onTriggerFullBulletin,
  currentPosition,
  stationState,
  duration
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('command');
  const [mediaSubTab, setMediaSubTab] = useState<MediaSubTab>('audio');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [mediaList, setMediaList] = useState<MediaFile[]>([]);
  const [reports, setReports] = useState<ListenerReport[]>([]);
  const [nextSyncIn, setNextSyncIn] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    const [m, r] = await Promise.all([dbService.getMedia(), dbService.getReports()]);
    setMediaList(m || []);
    setReports(r || []);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    const countdownInterval = setInterval(() => {
      const now = new Date();
      const mins = now.getMinutes() < 30 ? 29 - now.getMinutes() : 59 - now.getMinutes();
      const secs = 59 - now.getSeconds();
      setNextSyncIn(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdownInterval);
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    let count = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.startsWith('.') || file.name.includes('DS_Store')) continue;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const mime = file.type.toLowerCase();
        const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext) || mime.startsWith('audio/');
        const isVideo = ['mp4', 'webm', 'mov'].includes(ext) || mime.startsWith('video/');
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || mime.startsWith('image/');
        let finalType: 'audio' | 'video' | 'image' = isAudio ? 'audio' : (isVideo ? 'video' : 'image');
        if (!isAudio && !isVideo && !isImage) continue;

        setStatusMsg(`Importing: ${count + 1}...`);
        await dbService.addMedia({
          id: 'local-' + Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: '',
          file: file,
          type: finalType,
          timestamp: Date.now(),
          likes: 0
        });
        count++;
      }
      setStatusMsg(`Success: ${count} items added.`);
      onRefreshData();
      await loadData();
    } catch (error) { setStatusMsg('Import Error.'); }
    finally { setIsProcessing(false); setTimeout(() => setStatusMsg(''), 5000); if (e.target) e.target.value = ''; }
  };

  // --- HANDLERS FOR CLOUD SYNC ---
  const handleToggleRadio = async () => {
    const newState = !isRadioPlaying;
    onToggleRadio(); // Local Update

    // Cloud Update
    await realtimeService.updateStation({
      is_playing: newState,
      track_id: newState ? (mediaList.find(m => m.name === currentTrackName)?.id || '0') : '',
      track_name: currentTrackName,
      // If we are starting, the 'started_at' is now MINUS the offset we've already played
      started_at: newState ? (Date.now() - (currentPosition * 1000)) : Date.now(),
      updated_at: Date.now()
    });
  };

  const handlePlaySpecificTrack = async (track: MediaFile) => {
    onPlayTrack(track); // Local Update

    // Cloud Update
    await realtimeService.updateStation({
      is_playing: true,
      track_id: track.id,
      track_name: track.name,
      track_artist: "NDR Artist", // Placeholder or extract from filename
      duration: duration || 0,
      started_at: Date.now(),
      updated_at: Date.now()
    });
  };
  // -------------------------------

  const handleManualBroadcast = async (item: NewsItem) => {
    setIsProcessing(true);
    setStatusMsg(`Broadcasting: ${item.title}`);
    await onPushBroadcast?.(`Headline: ${item.title}. ${item.content}`);
    setIsProcessing(false);
    setStatusMsg(`Broadcast complete.`);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const triggerUpload = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('accept', accept);
      fileInputRef.current.click();
    }
  };

  const filteredMedia = mediaList.filter(m => {
    if (mediaSubTab === 'audio') return m.type === 'audio';
    return m.type === 'video' || m.type === 'image';
  });

  return (
    <div className="space-y-10 pb-32 text-green-900 animate-in fade-in duration-500">
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
      <input type="file" ref={folderInputRef} className="hidden" webkitdirectory="true" directory="true" multiple onChange={handleFileUpload} />

      {/* 1. MASTER COMMAND CENTER */}
      <section id="admin-command" className="space-y-4">
        <header className="px-1">
          <h2 className="text-xl font-black uppercase tracking-tighter text-green-950">Master Command</h2>
          <p className="text-[8px] font-bold text-green-600 uppercase tracking-widest">Global Station Control</p>
        </header>

        <div className="bg-white p-6 rounded-[2.5rem] border border-green-100 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-110 transition-transform"></div>
          <NowPlaying
            state={stationState}
            isAdmin={true}
            isPlaying={isRadioPlaying}
            onTogglePlay={handleToggleRadio}
            onSeek={(time) => {
              realtimeService.updateStation({
                started_at: Date.now() - (time * 1000)
              });
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => folderInputRef.current?.click()} className="bg-white p-6 rounded-3xl border border-green-100 flex flex-col items-center justify-center space-y-2 hover:bg-green-50 shadow-sm active:scale-95 transition-all">
            <i className="fas fa-folder-open text-xl text-green-600"></i>
            <span className="text-[9px] font-black uppercase tracking-widest">Batch Import</span>
          </button>
          <div className="bg-white p-6 rounded-3xl border border-amber-100 space-y-3 shadow-sm">
            <h3 className="text-[8px] font-black uppercase tracking-widest text-amber-600">Flash Jingles</h3>
            <div className="flex space-x-2">
              <button onClick={() => onPlayJingle?.(1)} className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl text-[8px] font-black uppercase shadow-sm active:scale-95 transition-all">ID 1</button>
              <button onClick={() => onPlayJingle?.(2)} className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl text-[8px] font-black uppercase shadow-sm active:scale-95 transition-all">ID 2</button>
            </div>
          </div>
        </div>

        <div className="bg-blue-600 p-4 rounded-3xl text-white flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <i className="fas fa-satellite-dish text-[10px]"></i>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-tighter">Auto-Sync Heartbeat</p>
              <p className="text-[7px] font-bold opacity-70 uppercase">Headlines + Weather</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-mono font-black">{nextSyncIn}</p>
          </div>
        </div>
      </section>

      {/* 2. LIVE NEWSROOM */}
      <section id="admin-news" className="space-y-4">
        <header className="px-1 flex justify-between items-end">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter text-green-950">Newsroom</h2>
            <p className="text-[8px] font-bold text-green-600 uppercase tracking-widest">Voice Broadcast Engine</p>
          </div>
          <button onClick={onTriggerFullBulletin} className="bg-[#008751] text-white px-4 py-2 rounded-xl text-[8px] font-black uppercase shadow-sm">Force Sync</button>
        </header>

        <div className="space-y-3 overflow-x-auto pb-2 -mx-1 px-1 flex no-scrollbar mask-gradient">
          {news.map(n => (
            <div key={n.id} className="min-w-[280px] bg-white p-6 rounded-[2rem] border border-green-50 shadow-md space-y-4 flex flex-col mr-3">
              <div className="flex-grow space-y-2">
                <h4 className="text-[11px] font-black text-green-950 leading-tight italic-none uppercase line-clamp-2">{n.title}</h4>
                <p className="text-[9px] text-green-800 font-medium line-clamp-3">{n.content}</p>
              </div>
              <button onClick={() => handleManualBroadcast(n)} className="w-full bg-green-50 text-green-700 py-3 rounded-2xl text-[8px] font-black uppercase flex items-center justify-center active:scale-95 transition-all">
                <i className="fas fa-microphone-lines mr-2"></i> Voice Broadcast
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 3. MEDIA ARCHIVE */}
      <section id="admin-media" className="space-y-4">
        <header className="px-1">
          <h2 className="text-xl font-black uppercase tracking-tighter text-green-950">Vault</h2>
          <p className="text-[8px] font-bold text-green-600 uppercase tracking-widest">Library & Assets</p>
        </header>

        <div className="bg-white rounded-[2.5rem] border border-green-100 shadow-xl overflow-hidden">
          <div className="flex bg-[#008751]/5 p-2 m-2 rounded-2xl border border-green-50">
            <button onClick={() => setMediaSubTab('audio')} className={`flex-1 py-2.5 text-[9px] font-black uppercase rounded-xl transition-all ${mediaSubTab === 'audio' ? 'bg-white text-[#008751] shadow-md scale-[1.02]' : 'text-green-600/60'}`}>Tracks</button>
            <button onClick={() => setMediaSubTab('video')} className={`flex-1 py-2.5 text-[9px] font-black uppercase rounded-xl transition-all ${mediaSubTab === 'video' ? 'bg-white text-[#008751] shadow-md scale-[1.02]' : 'text-green-600/60'}`}>Ad Content</button>
          </div>

          <div className="max-h-[400px] overflow-y-auto no-scrollbar p-2 space-y-2">
            {filteredMedia.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-2xl border border-green-50 flex items-center justify-between shadow-sm group hover:border-[#008751]/20 transition-all">
                <div className="flex items-center space-x-3 truncate pr-4">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${item.type === 'audio' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                    <i className={`fas ${item.type === 'audio' ? 'fa-music' : (item.type === 'video' ? 'fa-film' : 'fa-image')} text-xs`}></i>
                  </div>
                  <p className="text-[10px] font-black text-green-950 truncate">{item.name}</p>
                </div>
                <div className="flex space-x-1.5">
                  <button onClick={() => handlePlaySpecificTrack(item)} className="px-4 h-9 bg-[#008751] text-white rounded-xl flex items-center justify-center space-x-2 shadow-sm active:scale-95 transition-all text-[8px] font-black uppercase">
                    <i className="fas fa-tower-broadcast text-[8px]"></i>
                    <span>Push</span>
                  </button>
                  <button onClick={() => dbService.deleteMedia(item.id).then(loadData)} className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center active:scale-95 transition-all"><i className="fas fa-trash-alt text-[8px]"></i></button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-green-50/50">
            <button onClick={() => triggerUpload(mediaSubTab === 'audio' ? 'audio/*' : 'video/*,image/*')} className="w-full bg-white border border-green-200 text-green-900 py-4 rounded-[1.5rem] font-black text-[9px] uppercase tracking-widest shadow-sm active:scale-95 transition-all">
              <i className="fas fa-plus-circle mr-2 opacity-50"></i> Add to library
            </button>
          </div>
        </div>
      </section>

      {/* 4. STATION LOGS */}
      <section id="admin-logs" className="space-y-4">
        <header className="px-1">
          <h2 className="text-xl font-black uppercase tracking-tighter text-green-950">Intelligence</h2>
          <p className="text-[8px] font-bold text-green-600 uppercase tracking-widest">Operation Logs</p>
        </header>
        <div className="bg-black/90 rounded-[2rem] p-6 shadow-2xl font-mono border border-white/5">
          <div className="max-h-[200px] overflow-y-auto no-scrollbar space-y-2">
            {logs.slice().reverse().map(log => (
              <div key={log.id} className="py-1.5 flex justify-between items-start border-b border-white/5 last:border-0 opacity-80 hover:opacity-100 transition-opacity">
                <span className="text-[8px] text-green-400 leading-tight">{log.action}</span>
                <span className="text-[7px] text-white/30 shrink-0 ml-4">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminView;
