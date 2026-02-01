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
      }, 20000);
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
      timestamp: Date.now()
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
          onTogglePlay={() => onStateChange(!isRadioPlaying)}
          middleContent={
            <div className="w-full px-2">
              <div className="capsule-border bg-[#d7ecd1]/60 backdrop-blur-sm border-[#c5e4bc] text-[#00693e] text-[9px] font-black uppercase text-center tracking-[0.2em] py-4 shadow-sm">
                NOW PLAYING / LIVE STREAM
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

      {/* 4. NEWS TICKER MARQUEE */}
      <div className="marquee-container mb-8">
        <div className="marquee-text">
          {[...Array(3)].map((_, i) => (
            <span key={i} className="flex items-center">
              <span className="px-10">BRINGING YOU NEWS, CULTURE, AND MUSIC FROM THE NIGERIAN DIASPORA WORLDWIDE</span>
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mx-2"></span>
            </span>
          ))}
        </div>
      </div>

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

      {/* 6. SPONSORED HIGHLIGHTS */}
      <section className="px-6 pt-10 space-y-4">
        <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pl-1">SPONSORED HIGHLIGHTS</h3>
        <div className="relative capsule-card overflow-hidden premium-shadow aspect-video group">
          {currentAd ? (
            <>
              {currentAd.type === 'image' ? (
                <img src={currentAd.url} className="w-full h-full object-cover" alt="ad" />
              ) : (
                <SponsoredVideo video={currentAd} onEnded={nextAd} />
              )}
              {/* Overlay matching image */}
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
                <div className="flex items-center space-x-2">
                  <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[6px] font-black uppercase tracking-widest border border-white/30">● SPONSORED</span>
                </div>
                <div className="mt-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest">VERIFIED SPONSOR</h4>
                  <p className="text-[8px] font-bold text-white/60 tracking-tighter mt-1 uppercase">GLOBAL DIASPORA NETWORK</p>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full bg-black/5 flex items-center justify-center">
              <span className="text-[8px] font-black uppercase tracking-widest opacity-20">Awaiting Sponsored Content</span>
            </div>
          )}
        </div>
      </section>

      {/* 7. GOOGLE ADS SECTION */}
      <section id="community" className="px-6 py-10 space-y-4">
        <div className="flex justify-between items-center pl-1">
          <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">GOOGLE ADS</h3>
          <div className="flex items-center space-x-1 opacity-20">
            <i className="fas fa-info-circle text-[8px]"></i>
            <span className="text-[6px] font-bold uppercase">AdChoices</span>
          </div>
        </div>

        <div className="capsule-card bg-white p-8 text-center space-y-4 premium-shadow">
          <div className="space-y-2">
            <h4 className="text-[16px] font-black text-[#004d30] uppercase tracking-tighter">PREMIUM AFRICAN FASHION</h4>
            <p className="text-[10px] text-gray-500 font-medium leading-relaxed max-w-[240px] mx-auto">
              Global shipping starting at $15. Shop the latest authentic styles direct from Lagos!
            </p>
          </div>
          <button className="w-full h-[1px] bg-gradient-to-r from-blue-400 via-purple-400 to-orange-400 opacity-50"></button>
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

      {/* 9. COMMUNITY REPORTS (Integrated) */}
      <section className="px-6 pb-20 space-y-6">
        <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pl-1">VOICES OF THE DIASPORA</h3>
        <div className="space-y-3">
          {reports.length > 0 ? (
            reports.map((r, i) => (
              <div key={i} className="bg-white p-5 rounded-3xl border border-[#cfdfd6] premium-shadow group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[7px] font-black text-[#008751] uppercase tracking-tighter flex items-center">
                    <i className="fas fa-map-marker-alt mr-1.5 text-red-400"></i> {r.location}
                  </span>
                  <span className="text-[6px] font-mono text-gray-300 uppercase">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-[10px] text-[#004d30] font-bold leading-tight mt-2">"{r.content}"</p>
              </div>
            ))
          ) : (
            <div className="bg-white/40 border border-dashed border-[#cfdfd6] p-10 rounded-3xl text-center">
              <span className="text-[8px] font-black uppercase tracking-widest opacity-20">Community is quiet...</span>
            </div>
          )}
        </div>
      </section>


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
