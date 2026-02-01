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
  onSkipBack: () => void;
  onPushBroadcast?: (voiceText: string) => Promise<void>;
  onPlayJingle?: (index: 1 | 2) => Promise<void>;
  news?: NewsItem[];
  onTriggerFullBulletin?: () => Promise<void>;
  currentPosition: number;
  stationState: any; // Add stationState prop
  duration: number;   // Add duration prop
  player?: React.ReactNode;
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
  isShuffle,
  onToggleShuffle,
  onPlayAll,
  onSkipNext,
  onSkipBack,
  onPushBroadcast,
  onPlayJingle,
  news = [],
  onTriggerFullBulletin,
  currentPosition,
  stationState,
  duration,
  player
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('command');
  const [mediaSubTab, setMediaSubTab] = useState<MediaSubTab>('audio');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [mediaList, setMediaList] = useState<MediaFile[]>([]);
  const [reports, setReports] = useState<ListenerReport[]>([]);
  const [nextSyncIn, setNextSyncIn] = useState<string>('');
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

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

  // Video Slideshow Cycle (30 Seconds)
  useEffect(() => {
    const videos = mediaList.filter(m => m.type === 'video');
    if (videos.length === 0) return;

    const timer = setInterval(() => {
      setCurrentVideoIndex(prev => (prev + 1) % videos.length);
    }, 30000);

    return () => clearInterval(timer);
  }, [mediaList]);

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

  const renderNewsroom = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      <section className="bg-white p-6 rounded-3xl border border-green-100 shadow-xl space-y-4">
        <header className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-black text-green-950 uppercase">Global Intelligence</h3>
            <p className="text-[8px] font-bold text-green-600 uppercase">Cloud Headline Sync</p>
          </div>
          <button
            onClick={async () => {
              setIsProcessing(true);
              setStatusMsg("Scanning Global News...");
              try {
                if (onTriggerFullBulletin) {
                  await onTriggerFullBulletin();
                  setStatusMsg("Scan Success!");
                  onRefreshData();
                }
              } catch (e) {
                setStatusMsg("Scan Failed.");
              } finally {
                setIsProcessing(false);
                setTimeout(() => setStatusMsg(''), 3000);
              }
            }}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all shadow-md active:scale-95 ${isProcessing ? 'bg-gray-100 text-gray-400' : 'bg-[#008751] text-white hover:bg-green-700'}`}
          >
            <i className={`fas fa-satellite-dish mr-2 ${isProcessing ? 'animate-spin' : ''}`}></i>
            Run AI Scan
          </button>
        </header>

        <div className="space-y-3 pt-2">
          {news.length === 0 ? (
            <div className="py-10 text-center opacity-30 flex flex-col items-center">
              <i className="fas fa-newspaper text-2xl mb-2"></i>
              <span className="text-[9px] font-black uppercase">No Intelligence Recorded</span>
            </div>
          ) : (
            news.slice(0, 5).map((n, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-green-50/30 rounded-2xl border border-green-50 group hover:border-[#008751]/20 transition-all">
                <div className="flex-grow truncate pr-4">
                  <h4 className="text-[10px] font-black text-green-900 truncate uppercase">{n.title}</h4>
                  <p className="text-[8px] text-green-600 font-bold uppercase opacity-60 mt-0.5">{n.category || 'DIASPORA'}</p>
                </div>
                <button
                  onClick={() => handleManualBroadcast(n)}
                  className="px-3 py-1.5 bg-white border border-green-100 text-[#008751] rounded-lg text-[7px] font-black uppercase hover:bg-green-50 active:scale-95 transition-all"
                >
                  Broadcast
                </button>
              </div>
            ))
          )}
          {news.length > 5 && (
            <p className="text-center text-[7px] font-black text-green-600/40 uppercase pt-2">+ {news.length - 5} More Headlines in Feed</p>
          )}
        </div>
      </section>

      <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center animate-pulse">
            <i className="fas fa-clock text-[10px]"></i>
          </div>
          <div>
            <p className="text-[9px] font-black text-amber-900 uppercase">Station Heartbeat</p>
            <p className="text-[7px] font-bold text-amber-700/60 uppercase">Next Auto-Sync: {nextSyncIn}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCommand = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* THE MIDWAY */}
      <section id="admin-midway" className="space-y-4">
        {/* ... existing Midway content ... */}
        <div className="bg-white p-8 rounded-[3rem] border-4 border-white shadow-2xl relative overflow-hidden group isolate">
          <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent -z-10"></div>
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-32 h-32 bg-[#008751]/5 rounded-[2.5rem] flex items-center justify-center border border-green-100 shadow-inner relative overflow-hidden">
              {isRadioPlaying && (
                <div className="absolute inset-0 flex items-center justify-center space-x-1">
                  {[1, 2, 3, 4].map(i => <div key={i} className={`w-1 bg-[#008751] rounded-full animate-music-bar-${(i % 3) + 1}`} style={{ height: '30%' }}></div>)}
                </div>
              )}
              <i className={`fas fa-${isRadioPlaying ? 'tower-broadcast' : 'radio'} text-3xl text-green-950/20`}></i>
            </div>
            <div className="space-y-2 max-w-xs">
              <h3 className="text-lg font-black text-green-950 uppercase tracking-tighter line-clamp-2 leading-none">
                {currentTrackName || 'Station Standby'}
              </h3>
              <p className="text-[9px] font-bold text-green-600/60 uppercase tracking-widest mt-1">
                {isRadioPlaying ? 'Current Transmission' : 'Awaiting Broadcaster'}
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <button onClick={onSkipBack} className="w-12 h-12 rounded-2xl bg-green-50 text-green-700 flex items-center justify-center hover:bg-green-100 active:scale-90 transition-all border border-green-100"><i className="fas fa-backward-step text-sm"></i></button>
              <button onClick={handleToggleRadio} className={`w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-xl transition-all active:scale-95 border-4 border-white ${isRadioPlaying ? 'bg-[#f14d4d] text-white shadow-[#f14d4d]/20' : 'bg-[#008751] text-white shadow-[#008751]/20'}`}><i className={`fas fa-${isRadioPlaying ? 'pause' : 'play'} text-2xl ${!isRadioPlaying ? 'ml-1' : ''}`}></i></button>
              <button onClick={onSkipNext} className="w-12 h-12 rounded-2xl bg-green-50 text-green-700 flex items-center justify-center hover:bg-green-100 active:scale-90 transition-all border border-green-100"><i className="fas fa-forward-step text-sm"></i></button>
            </div>
            <div className="w-full px-4">{player}</div>
            <div className="flex items-center space-x-4 w-full px-4 pt-4 border-t border-green-50">
              <button onClick={onToggleShuffle} className={`flex-1 py-3 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${isShuffle ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}><i className="fas fa-shuffle mr-2"></i> Shuffle</button>
              <button onClick={onPlayAll} className="flex-[3] px-6 py-4 bg-[#008751] text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all border-b-4 border-green-950"><i className="fas fa-play-circle mr-2 text-[12px]"></i> MASTER</button>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK ACTIONS */}
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
    </div>
  );

  const renderMedia = () => (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <section id="admin-media" className="space-y-4">
        <div className="bg-white rounded-[2.5rem] border border-green-100 shadow-xl overflow-hidden">
          <div className="flex bg-[#008751]/5 p-2 m-2 rounded-2xl border border-green-50">
            <button onClick={() => setMediaSubTab('audio')} className={`flex-1 py-2.5 text-[9px] font-black uppercase rounded-xl transition-all ${mediaSubTab === 'audio' ? 'bg-white text-[#008751] shadow-md scale-[1.02]' : 'text-green-600/60'}`}>Tracks</button>
            <button onClick={() => setMediaSubTab('video')} className={`flex-1 py-2.5 text-[9px] font-black uppercase rounded-xl transition-all ${mediaSubTab === 'video' ? 'bg-white text-[#008751] shadow-md scale-[1.02]' : 'text-green-600/60'}`}>Ad Content</button>
          </div>

          <div className="max-h-[500px] overflow-y-auto no-scrollbar p-2 space-y-2">
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
    </div>
  );

  const renderInbox = () => (
    <div className="space-y-6 animate-in slide-in-from-left-4 duration-500">
      <section id="admin-inbox" className="space-y-4">
        <div className="bg-white rounded-[2.5rem] border border-amber-100 shadow-xl overflow-hidden min-h-[150px]">
          {reports.filter(r => r.status === 'pending').length === 0 ? (
            <div className="p-10 text-center opacity-30 flex flex-col items-center">
              <i className="fas fa-check-double text-3xl mb-2"></i>
              <span className="text-[9px] font-black uppercase tracking-widest">Inbox Clean</span>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto no-scrollbar p-2 space-y-2">
              {reports.filter(r => r.status === 'pending').map(report => (
                <div key={report.id} className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-[10px] font-black text-amber-900 uppercase">{report.reporterName}</h4>
                      <p className="text-[7px] font-bold text-amber-700/60 uppercase">{report.location}</p>
                    </div>
                    <span className="text-[6px] font-black bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full">PENDING</span>
                  </div>
                  <p className="text-[10px] text-amber-950 font-medium leading-relaxed">{report.content}</p>
                  <div className="flex space-x-2 pt-2">
                    <button onClick={() => dbService.updateReportStatus(report.id, 'approved').then(loadData)} className="flex-1 bg-[#008751] text-white py-2 rounded-xl text-[8px] font-black uppercase shadow-sm active:scale-95 transition-all">Approve</button>
                    <button onClick={() => dbService.updateReportStatus(report.id, 'rejected').then(loadData)} className="flex-1 bg-red-100 text-red-600 py-2 rounded-xl text-[8px] font-black uppercase active:scale-95 transition-all">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const renderLogs = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <section id="admin-logs" className="space-y-4">
        <div className="bg-black/90 rounded-[2.5rem] p-8 shadow-2xl font-mono border border-white/5">
          <div className="max-h-[500px] overflow-y-auto no-scrollbar space-y-3">
            {logs.slice().reverse().map(log => (
              <div key={log.id} className="py-2 flex justify-between items-start border-b border-white/5 last:border-0 opacity-80 hover:opacity-100 transition-opacity">
                <span className="text-[9px] text-green-400 leading-tight pr-4">{log.action}</span>
                <span className="text-[7px] text-white/30 shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="pb-32 text-green-900 animate-in fade-in duration-500">
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
      <input type="file" ref={folderInputRef} className="hidden" webkitdirectory="true" directory="true" multiple onChange={handleFileUpload} />

      {/* ADMIN NAVIGATION */}
      <nav className="flex bg-[#008751]/10 p-1.5 rounded-2xl border border-green-100 mb-8 overflow-x-auto no-scrollbar">
        {[
          { id: 'command', icon: 'tower-broadcast', label: 'Air' },
          { id: 'bulletin', icon: 'newspaper', label: 'News' },
          { id: 'media', icon: 'music', label: 'Vault' },
          { id: 'inbox', icon: 'inbox', label: 'Mail' },
          { id: 'logs', icon: 'terminal', label: 'Intel' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-[9px] font-black uppercase transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-[#008751] text-white shadow-lg scale-[1.05]' : 'text-green-800/60 hover:bg-green-50'}`}
          >
            <i className={`fas fa-${tab.icon} text-[10px]`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* TAB CONTENT */}
      <div className="min-h-[400px]">
        {activeTab === 'command' && renderCommand()}
        {activeTab === 'bulletin' && renderNewsroom()}
        {activeTab === 'media' && renderMedia()}
        {activeTab === 'inbox' && renderInbox()}
        {activeTab === 'logs' && renderLogs()}
      </div>

      {/* STATUS TOAST */}
      {statusMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-black/90 text-white px-6 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center space-x-3">
            {isProcessing && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>}
            <span className="text-[10px] font-black uppercase tracking-widest">{statusMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminView;
