import React, { useState, useEffect, useCallback, useRef } from 'react';
import SponsoredVideo from './SponsoredVideo';
import { NewsItem, MediaFile, AdminMessage, ListenerReport, UserRole } from '../types';
import { dbService } from './../services/dbService';
import { CHANNEL_INTRO, DESIGNER_NAME, APP_NAME } from '../constants';
import RadioPlayer from './RadioPlayer';
import NowPlaying from './NowPlaying';
import { StationState } from '../services/realtimeService';

interface ListenerViewProps {
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

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim()) return;
    await dbService.addReport({
      id: Math.random().toString(36).substring(2, 9),
      reporterName: 'Listener',
      location,
      content: reportText,
      timestamp: Date.now(),
      status: 'pending'
    });
    setReportText('');
    setIsReporting(false);
    setShareFeedback('Report Sent!');
    setTimeout(() => setShareFeedback(''), 3000);
  };

  const currentAd = sponsoredVideos[adIndex];

  return (
    <div className="flex flex-col bg-[#ecf7f1] text-[#004d30] scroll-smooth pb-32">
      {/* 1. HERO SECTION & CONTROLS (Unified for exact layout match) */}
      <section id="home" className="pt-8 px-6 animate-in fade-in duration-700">
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

      {/* 3. STATUS & INVITE BAR */}
      <div className="px-6 py-8 flex items-center justify-between">
        <div className="bg-white rounded-2xl px-5 py-3 border border-[#cfdfd6] flex flex-col premium-shadow">
          <span className="text-[9px] font-black text-[#008751] uppercase tracking-tighter">GLOBAL DIASPORA</span>
          <span className="text-[8px] font-bold text-gray-400 mt-0.5">{localTime}</span>
        </div>
        <button
          onClick={handleShare}
          className="bg-[#008751] hover:bg-[#00693e] text-white rounded-2xl px-6 py-4 flex items-center space-x-2 shadow-lg active:scale-95 transition-all"
        >
          <i className="fas fa-paper-plane text-[10px]"></i>
          <span className="text-[10px] font-black uppercase tracking-widest">{shareFeedback || 'INVITE FRIENDS'}</span>
        </button>
      </div>

      {/* 2. NEWS TICKER (Scrolling Text) */}
      <div className="bg-[#008751] py-3 shadow-lg">
        <div className="flex whitespace-nowrap animate-marquee">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/90 px-4">
            BRINGING YOU NEWS, CULTURE, AND MUSIC FROM THE NIGERIAN DIASPORA WORLDWIDE •
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/90 px-4">
            STREAMING LIVE • NIGERIA DIASPORA RADIO • THE VOICE OF NIGERIA ABROAD •
          </span>
        </div>
      </div>

      {/* 3. SPONSORED HIGHLIGHTS (Video Ads) */}
      <section id="sponsored" className="pt-10 px-6 space-y-6">
        <header className="px-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-700/60">Sponsored Highlights</h2>
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

      {/* 4. GOOGLE ADS SECTION */}
      <section className="pt-10 px-6">
        <div className="bg-white rounded-[2.5rem] border border-green-100 p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-20">
            <i className="fas fa-info-circle text-[8px]"></i>
            <span className="text-[6px] font-bold ml-1">AdChoices</span>
          </div>
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <h4 className="text-[11px] font-black text-green-950 uppercase tracking-widest">Premium African Fashion</h4>
            <p className="text-[9px] text-green-600/70 font-bold uppercase leading-relaxed max-w-[200px]">
              Global shipping starting at $15. Shop the latest authentic styles direct from Lagos.
            </p>
            <button className="bg-green-50 text-green-700 px-6 py-2.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-green-100 hover:bg-green-100 transition-colors shadow-sm">
              Shop Now
            </button>
          </div>
        </div>
      </section>

      {/* 5. COMMUNITY PULSE (Approved Reports) */}
      <section id="community" className="pt-10 px-6 space-y-6 mb-20">
        <header className="px-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-700/60">Community Pulse</h2>
        </header>

        <div className="space-y-4">
          {reports.length === 0 ? (
            <div className="bg-white/40 p-10 rounded-[2.5rem] border border-dashed border-green-200 text-center flex flex-col items-center text-green-800/40">
              <i className="fas fa-feather text-2xl mb-2"></i>
              <span className="text-[9px] font-black uppercase tracking-widest">Be the first to share</span>
            </div>
          ) : (
            reports.map((report) => (
              <div key={report.id} className="bg-white p-6 rounded-[2rem] shadow-lg border border-green-50 space-y-3 relative overflow-hidden group hover:shadow-green-900/5 transition-all">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 shadow-inner">
                    <i className="fas fa-map-marker-alt text-xs"></i>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-green-950 uppercase tracking-tighter">{report.reporterName}</h4>
                    <p className="text-[8px] text-green-500 font-bold uppercase tracking-widest">{report.location}</p>
                  </div>
                </div>
                <p className="text-[10px] text-green-900/80 font-medium leading-relaxed bg-[#f8fdfa] p-4 rounded-xl italic">
                  "{report.content}"
                </p>
                <div className="text-right">
                  <span className="text-[6px] font-black text-green-300 uppercase">{new Date(report.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Action Button: Send Report */}
        <div className="pt-4">
          <button
            onClick={() => {
              const content = prompt("What's happening in your location?");
              if (content) {
                const reporterName = prompt("Your Name") || 'Anonymous';
                const location = prompt("Location") || 'Unknown';
                const newReport: ListenerReport = {
                  id: 'report-' + Date.now(),
                  reporterName,
                  location,
                  content,
                  timestamp: Date.now(),
                  status: 'pending'
                };
                dbService.addReport(newReport).then(() => {
                  alert("Report sent to Admin for moderation! It will appear once approved.");
                });
              }
            }}
            className="w-full capsule-border bg-[#008751] text-white py-5 text-[10px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all flex items-center justify-center space-x-3"
          >
            <i className="fas fa-paper-plane text-xs animate-bounce-right"></i>
            <span>Send Community Report</span>
          </button>
        </div>
      </section>

      {/* 5. NEWSROOM (LATEST INTELLIGENCE) */}
      <section id="news" className="px-6 space-y-4">
        <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pl-1">LATEST INTELLIGENCE</h3>
        <div className="space-y-4">
          {news.slice(0, 5).map((n, i) => (
            <article key={i} className="capsule-card p-6 premium-shadow relative overflow-hidden group hover:scale-[1.01] transition-transform">
              <div className="flex justify-between items-start mb-2">
                <span className="bg-green-100 text-[#008751] px-2 py-0.5 rounded-full text-[6px] font-black uppercase tracking-widest">HEADLINE</span>
                <span className="text-[6px] font-mono text-gray-400 uppercase">JUST IN</span>
              </div>
              <h4 className="text-[12px] font-black text-[#004d30] leading-snug uppercase tracking-tight">{n.title}</h4>
              <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-2 line-clamp-2">{n.content}</p>
              <div className="mt-4 flex items-center text-[#008751] text-[8px] font-black uppercase tracking-widest">
                Read Full Report <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 8. ADMIN ANNOUNCEMENTS (OFFICIAL UPDATES) */}
      {adminMessages.length > 0 && (
        <section className="px-6 pb-10 space-y-4">
          <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pl-1">OFFICIAL UPDATES</h3>
          <div className="space-y-3">
            {adminMessages.map((m, i) => (
              <div key={i} className="bg-[#008751] p-5 rounded-3xl text-white shadow-xl flex items-start space-x-4 animate-in slide-in-from-left-2 duration-500">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 border border-white/30">
                  <i className="fas fa-bullhorn text-[12px]"></i>
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Station HQ</span>
                    <span className="text-[6px] font-black bg-white/20 px-2 py-0.5 rounded-full">LIVE</span>
                  </div>
                  <p className="text-[11px] font-bold leading-relaxed">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}


      {/* Footer Branding */}
      <footer className="mt-auto px-4 py-8 text-center opacity-30 pb-32">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-green-950 italic-none">{APP_NAME}</p>
        <p className="text-[6px] font-bold text-green-950/50 uppercase tracking-[0.5em] mt-2 italic-none">{DESIGNER_NAME} &bull; MOBILE PREMIO</p>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: inline-flex; animation: marquee 30s linear infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
};

export default ListenerView;
