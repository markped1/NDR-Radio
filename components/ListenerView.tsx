import React, { useState, useEffect, useCallback, useRef } from 'react';
import SponsoredVideo from './SponsoredVideo';
import { NewsItem, MediaFile, AdminMessage, ListenerReport, UserRole } from '../types';
import { dbService } from './../services/dbService';
import { CHANNEL_INTRO, DESIGNER_NAME, APP_NAME } from '../constants';
import RadioPlayer from './RadioPlayer';
import NowPlaying from './NowPlaying';
import { StationState } from '../services/realtimeService';

interface ListenerViewProps {
  activeTab: 'home' | 'news' | 'radio' | 'community';
  news: NewsItem[];
  onStateChange: (isPlaying: boolean) => void;
  isRadioPlaying: boolean;
  sponsoredVideos: MediaFile[];
  activeTrackUrl: string | null;
  currentTrackName: string;
  adminMessages: AdminMessage[];
  reports: ListenerReport[];
  onPlayTrack: (track: MediaFile) => void;
  stationState: StationState | null;
}

const ListenerView: React.FC<ListenerViewProps> = ({
  activeTab,
  news,
  onStateChange,
  isRadioPlaying,
  sponsoredVideos,
  activeTrackUrl,
  currentTrackName,
  reports,
  adminMessages = [],
  stationState
}) => {
  const [location, setLocation] = useState<string>('Syncing...');
  const [localTime, setLocalTime] = useState<string>('');
  const [reportText, setReportText] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const [shareFeedback, setShareFeedback] = useState('');

  const timerRef = useRef<number | null>(null);

  const nextAd = useCallback(() => {
    if (sponsoredVideos.length > 0) {
      setAdIndex((prev) => (prev + 1) % sponsoredVideos.length);
    }
  }, [sponsoredVideos.length]);

  useEffect(() => {
    if (sponsoredVideos.length > 0) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        nextAd();
      }, 30000);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [adIndex, sponsoredVideos.length, nextAd]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => setLocation(`Node: ${pos.coords.latitude.toFixed(1)}, ${pos.coords.longitude.toFixed(1)}`), () => setLocation('Global Diaspora'));
    }
    const timer = setInterval(() => setLocalTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleShare = async () => {
    const text = "📻 Tune in to Nigeria Diaspora Radio (NDR)! The voice of Nigerians abroad. Live news and culture. Listen here: ";
    const url = window.location.href.split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Nigeria Diaspora Radio', text, url });
        setShareFeedback('Shared!');
      } else {
        await navigator.clipboard.writeText(`${text}${url}`);
        setShareFeedback('Link Copied!');
      }
    } catch (err) {
      console.warn("Share failed", err);
    } finally {
      setTimeout(() => setShareFeedback(''), 3000);
    }
  };

  const currentAd = sponsoredVideos[adIndex];

  const renderTicker = () => {
    const defaultText = "WELCOME TO NIGERIA DIASPORA RADIO • THE VOICE OF NIGERIA ABROAD • STREAMING LIVE AFROBEATS AND CULTURE";
    const hasNews = news && news.length > 0;

    // VERIFICATION LOG: Helping user see if data is actually arriving
    if (Date.now() % 5000 < 1000) { // Log once every ~5 seconds to avoid flood
      console.log(`[NDR TICKER SYNC] Currently displaying ${news?.length || 0} headlines.`);
    }

    // Create a dynamic ticker string with high-impact separators
    // Duplicating many times to ensure continuous marquee regardless of screen width
    const baseText = hasNews
      ? news.map(n => n.title.toUpperCase()).join(' • ')
      : defaultText;

    const tickerText = `${baseText} • ${baseText} • ${baseText} • ${baseText}`;

    return (
      <div className="bg-[#008751] py-3 shadow-lg overflow-hidden relative border-y border-white/10 flex items-center">
        {/* Fixed "Breaking" Label to guarantee user sees the change */}
        <div className="bg-red-600 text-white px-3 py-1 text-[8px] font-black uppercase z-10 shrink-0 animate-pulse ml-2 rounded-sm border border-red-400">
          BREAKING
        </div>
        <div className="flex whitespace-nowrap animate-marquee flex-grow">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/90 px-4">
            {tickerText}
          </span>
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-8 pb-10">
      {/* 1. HERO SECTION & CONTROLS */}
      <section className="pt-8 px-6 animate-in fade-in duration-700">
        <NowPlaying
          state={stationState}
          isAdmin={false}
          isPlaying={isRadioPlaying}
          onTogglePlay={() => {
            if (!stationState?.is_playing) {
              alert("Station is currently OFFLINE. Tune in when the Midway is live!");
              return;
            }
            onStateChange(!isRadioPlaying);
          }}
          middleContent={
            <div className="w-full px-2">
              <div className={`capsule-border backdrop-blur-sm text-[9px] font-black uppercase text-center tracking-[0.2em] py-4 shadow-sm transition-colors ${stationState?.is_playing ? 'bg-[#d7ecd1]/60 border-[#c5e4bc] text-[#00693e]' : 'bg-gray-100/60 border-gray-200 text-gray-400'}`}>
                {stationState?.is_playing ? 'LIVE FROM THE MIDWAY' : 'STATION STANDBY'}
              </div>
            </div>
          }
        />
      </section>

      {/* 2. NEWS TICKER */}
      {renderTicker()}

      {/* 3. SPONSORED HIGHLIGHTS */}
      <section className="px-6 space-y-6">
        <header className="px-2 flex justify-between items-center">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-700/60">Sponsored Highlights</h2>
          <span className="text-[8px] font-black text-green-300 uppercase">{adIndex + 1} / {sponsoredVideos.length}</span>
        </header>
        <div className="space-y-4">
          {currentAd ? (
            <div key={currentAd.id} className="relative aspect-video rounded-[2rem] overflow-hidden shadow-2xl border-4 border-white group">
              <SponsoredVideo video={currentAd} />
              <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-2 py-1 rounded-md flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></div>
                <span className="text-[7px] font-black text-white uppercase tracking-widest">Sponsored</span>
              </div>
            </div>
          ) : (
            <div className="bg-white/40 p-10 rounded-[2.5rem] border border-dashed border-green-200 text-center flex flex-col items-center text-green-800/40">
              <i className="fas fa-video-slash text-2xl mb-2"></i>
              <span className="text-[9px] font-black uppercase tracking-widest">Check back later</span>
            </div>
          )}
        </div>
      </section>

      {/* 3. INVITE CARD */}
      <div className="px-6 pt-4">
        <button
          onClick={handleShare}
          className="w-full bg-[#008751] hover:bg-[#00693e] text-white rounded-3xl p-6 flex items-center justify-between shadow-xl active:scale-95 transition-all group"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <i className="fas fa-paper-plane text-lg group-hover:rotate-12 transition-transform"></i>
            </div>
            <div className="text-left">
              <span className="block text-[11px] font-black uppercase tracking-widest leading-none">Invite Friends</span>
              <span className="text-[8px] font-bold opacity-60 uppercase mt-1">Share the voice of diaspora</span>
            </div>
          </div>
          <span className="text-[10px] font-black">{shareFeedback || 'SHARE'}</span>
        </button>
      </div>
    </div>
  );

  const renderNews = () => (
    <div className="p-6 space-y-8 animate-in slide-in-from-right-4 duration-500">
      <header className="px-1 pt-4">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-[#008751]">Newsroom</h2>
        <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mt-1">Latest Intelligence Feed</p>
      </header>

      <div className="space-y-4">
        {news.length === 0 ? (
          <div className="py-20 text-center opacity-30 flex flex-col items-center">
            <i className="fas fa-satellite-dish text-4xl mb-4 animate-pulse"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Connecting to Satellites...</span>
          </div>
        ) : (
          news.map((n, i) => (
            <article key={i} className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-green-50 relative overflow-hidden group">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-green-100 text-[#008751] px-3 py-1 rounded-full text-[7px] font-black uppercase tracking-widest">{n.category || 'HEADLINE'}</span>
                <span className="text-[7px] font-black text-gray-300 uppercase tracking-widest">{new Date(n.timestamp).toLocaleDateString()}</span>
              </div>
              <h4 className="text-[14px] font-black text-[#004d30] leading-snug uppercase tracking-tight">{n.title}</h4>
              <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-3">{n.content}</p>
              <div className="mt-6 pt-4 border-t border-green-50 flex items-center justify-between">
                <span className="text-[8px] font-black text-green-700/40 uppercase tracking-widest">{APP_NAME} OFFICIAL</span>
                <i className="fas fa-shield-check text-green-600 text-xs"></i>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );

  const renderRadio = () => (
    <div className="p-6 space-y-10 animate-in fade-in zoom-in-95 duration-500 min-h-[70vh] flex flex-col justify-center">
      <div className="text-center space-y-8">
        <div className="w-48 h-48 bg-white rounded-[4rem] mx-auto shadow-2xl flex items-center justify-center border-4 border-white relative isolate overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent -z-10"></div>
          {isRadioPlaying && (
            <div className="absolute inset-0 flex items-center justify-center space-x-1 opacity-20">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-2 bg-green-600 rounded-full animate-pulse" style={{ height: `${20 + (i * 10)}%`, animationDelay: `${i * 0.2}s` }}></div>)}
            </div>
          )}
          <i className={`fas fa-${stationState?.is_playing ? 'tower-broadcast' : 'radio'} text-6xl text-green-950/20 group-hover:scale-110 transition-transform`}></i>
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl font-black text-green-950 uppercase tracking-tighter leading-none px-4">
            {currentTrackName}
          </h3>
          <p className="text-[11px] font-black text-green-600 uppercase tracking-[0.3em]">
            {stationState?.is_playing ? 'TRANSMITTING WORLDWIDE' : 'WAITING FOR MIDWAY'}
          </p>
        </div>

        <div className="max-w-xs mx-auto">
          <button
            onClick={() => {
              if (!stationState?.is_playing) {
                alert("Station is currently OFFLINE.");
                return;
              }
              onStateChange(!isRadioPlaying);
            }}
            className={`w-full py-6 rounded-3xl font-black uppercase tracking-widest text-sm shadow-2xl active:scale-95 transition-all flex items-center justify-center space-x-4 border-4 border-white ${isRadioPlaying ? 'bg-red-500 text-white' : 'bg-[#008751] text-white'}`}
          >
            <i className={`fas fa-${isRadioPlaying ? 'pause' : 'play'} text-lg`}></i>
            <span>{isRadioPlaying ? 'Mute Station' : 'Join Midway Live'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderCommunity = () => (
    <div className="p-6 space-y-8 animate-in slide-in-from-left-4 duration-500">
      <header className="px-1 pt-4">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-[#008751]">People</h2>
        <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mt-1">Community Pulse & Interactions</p>
      </header>

      {/* ADMIN ANNOUNCEMENTS */}
      {adminMessages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">HQ UPDATES</h3>
          {adminMessages.map((m, i) => (
            <div key={i} className="bg-[#008751] p-5 rounded-3xl text-white shadow-xl flex items-start space-x-4">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 border border-white/30">
                <i className="fas fa-bullhorn text-[12px]"></i>
              </div>
              <p className="text-[12px] font-bold leading-relaxed">{m.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* COMMUNITY REPORTS */}
      <div className="space-y-4">
        <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">LISTENER REPORTS</h3>
        {reports.length === 0 ? (
          <div className="bg-white/40 p-10 rounded-[2.5rem] border border-dashed border-green-200 text-center flex flex-col items-center opacity-30">
            <i className="fas fa-feather text-2xl mb-2"></i>
            <span className="text-[9px] font-black uppercase tracking-widest">Quiet in the diaspora...</span>
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="bg-white p-6 rounded-[2rem] shadow-lg border border-green-50 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-50 rounded-2xl flex items-center justify-center text-green-600">
                  <i className="fas fa-map-marker-alt text-xs"></i>
                </div>
                <div>
                  <h4 className="text-[11px] font-black text-green-950 uppercase">{report.reporterName}</h4>
                  <p className="text-[8px] text-green-500 font-bold uppercase tracking-widest">{report.location}</p>
                </div>
              </div>
              <p className="text-[11px] text-green-900/80 font-medium leading-relaxed bg-[#f8fdfa] p-4 rounded-xl italic">
                "{report.content}"
              </p>
            </div>
          ))
        )}
      </div>

      <button
        onClick={() => {
          const content = prompt("What's happening in your location?");
          if (content) {
            const reporterName = prompt("Your Name") || 'Anonymous';
            const locationStr = prompt("Location") || location || 'Unknown';
            dbService.addReport({
              id: 'report-' + Date.now(),
              reporterName,
              location: locationStr,
              content,
              timestamp: Date.now(),
              status: 'pending'
            }).then(() => alert("Report sent for moderation!"));
          }
        }}
        className="w-full bg-white text-green-800 py-6 rounded-3xl font-black uppercase tracking-widest text-[10px] shadow-sm border border-green-100 hover:bg-green-50 active:scale-95 transition-all"
      >
        <i className="fas fa-plus-circle mr-2 opacity-40"></i> Post Update
      </button>
    </div>
  );

  return (
    <div className="flex flex-col bg-[#ecf7f1] text-[#004d30] scroll-smooth min-h-screen">
      {/* GLOBAL STATUS BAR */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-[#008751] uppercase tracking-tighter">{location}</span>
          <span className="text-[8px] font-bold text-gray-400 mt-0.5">{localTime}</span>
        </div>
        <div className={`px-3 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${stationState?.is_playing ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
          {stationState?.is_playing ? 'LIVE' : 'IDLE'}
        </div>
      </div>

      <div className="flex-grow">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'news' && renderNews()}
        {activeTab === 'radio' && renderRadio()}
        {activeTab === 'community' && renderCommunity()}
      </div>

      {/* FOOTER PADDING */}
      <footer className="px-4 py-12 text-center opacity-20">
        <p className="text-[8px] font-black uppercase tracking-[0.3em]">{APP_NAME} &bull; {DESIGNER_NAME}</p>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-25%); } }
        .animate-marquee { display: inline-flex; animation: marquee 8s linear infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
};

export default ListenerView;
