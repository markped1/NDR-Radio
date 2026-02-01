
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SponsoredVideo from './SponsoredVideo';
import { NewsItem, MediaFile, AdminMessage, ListenerReport } from '../types';
import { dbService } from './../services/dbService';
import { CHANNEL_INTRO, DESIGNER_NAME, APP_NAME } from '../constants';

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
  activeTab: 'home' | 'news' | 'radio' | 'community';
}

import RadioPlayer from './RadioPlayer';
import { UserRole } from '../types';

const ListenerView: React.FC<ListenerViewProps> = ({
  news,
  onStateChange,
  isRadioPlaying,
  sponsoredVideos,
  activeTrackUrl,
  currentTrackName,
  reports,
  adminMessages = [],
  activeTab
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
    <div className="flex flex-col h-full bg-[#f8fafc] text-[#008751]">
      {/* 1. HOME TAB */}
      {activeTab === 'home' && (
        <div className="flex flex-col space-y-6 pb-20 px-4 animate-in fade-in slide-in-from-right-4 duration-500">
          {/* Welcome Card */}
          <section className="pt-4">
            <div className="bg-gradient-to-br from-[#008751] to-green-900 rounded-[2rem] p-6 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
              <div className="relative z-10 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70 italic-none">Live Now</p>
                    <h2 className="text-2xl font-black tracking-tighter leading-tight italic-none">NIGERIA DIASPORA <br /> RADIO</h2>
                  </div>
                  <i className="fas fa-satellite-dish animate-pulse text-green-300"></i>
                </div>
                <div className="pt-2">
                  <p className="text-[9px] font-medium text-green-50/80 leading-relaxed max-w-[80%] italic-none">Connecting Nigerians across the globe with news, music, and community spirit.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Featured Ads / Video */}
          <section className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h3 className="text-[11px] font-black uppercase text-green-950 tracking-widest italic-none">Featured Highlights</h3>
              <span className="text-[8px] font-bold text-green-600 uppercase italic-none">See All</span>
            </div>
            <div className="relative group">
              {currentAd ? (
                <div className="rounded-3xl overflow-hidden border border-green-100 h-[220px] shadow-xl group-hover:shadow-green-900/10 transition-shadow">
                  {currentAd.type === 'image' ? (
                    <img src={currentAd.url} className="w-full h-full object-cover" alt="ad" />
                  ) : (
                    <SponsoredVideo video={currentAd} onEnded={nextAd} />
                  )}
                </div>
              ) : (
                <div className="bg-white h-[180px] rounded-3xl border border-dashed border-green-200 flex flex-col items-center justify-center opacity-40">
                  <i className="fas fa-signal mb-2 text-green-600"></i>
                  <span className="text-[8px] font-black uppercase tracking-widest italic-none">Signal Lost: Awaiting Sponsors</span>
                </div>
              )}
            </div>
          </section>

          {/* Quick News Preview */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-black uppercase text-green-950 tracking-widest px-1 italic-none">Latest Headlines</h3>
            <div className="space-y-3">
              {news.slice(0, 2).map((n, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-green-50 shadow-sm flex space-x-4 items-center active:scale-[0.98] transition-transform">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-bolt text-[#008751] text-xs"></i>
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-[10px] font-black text-green-950 line-clamp-1 italic-none">{n.title}</p>
                    <p className="text-[8px] text-green-600/60 font-medium italic-none">Just moments ago</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* 2. NEWS TAB */}
      {activeTab === 'news' && (
        <div className="flex flex-col space-y-4 pb-20 px-4 animate-in fade-in slide-in-from-right-4 duration-500">
          <header className="pt-6 pb-2">
            <h2 className="text-3xl font-black text-green-950 tracking-tighter italic-none">NEWSROOM</h2>
            <p className="text-[10px] font-bold text-green-600 uppercase tracking-[0.2em] italic-none">Verified Intelligence</p>
          </header>

          <div className="bg-[#008751] h-10 rounded-xl flex items-center overflow-hidden shadow-lg shadow-green-900/20">
            <div className="flex whitespace-nowrap animate-marquee items-center text-white">
              <span className="text-[9px] font-black uppercase px-8 tracking-widest italic-none">{CHANNEL_INTRO}</span>
              {news.map((n, i) => (
                <span key={i} className="text-[9px] font-black uppercase px-8 italic-none">
                  <span className="text-red-400 mr-2">●</span> {n.title}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4">
            {news.map((n, i) => (
              <article key={i} className="bg-white p-6 rounded-[2rem] border border-green-50 shadow-xl space-y-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-full -mr-12 -mt-12 opacity-50 group-hover:scale-110 transition-transform"></div>
                <div className="relative z-10 space-y-3">
                  <span className="text-[7px] font-black bg-green-100 text-green-800 px-3 py-1 rounded-full uppercase tracking-widest italic-none">Top Story</span>
                  <h3 className="text-lg font-black text-green-950 leading-tight italic-none">{n.title}</h3>
                  <p className="text-[10px] text-green-800 font-medium leading-relaxed italic-none">{n.content}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* 3. RADIO TAB (Full Immersive) */}
      {activeTab === 'radio' && (
        <div className="h-full flex flex-col justify-center animate-in zoom-in duration-500">
          <RadioPlayer
            onStateChange={onStateChange}
            activeTrackUrl={activeTrackUrl}
            currentTrackName={currentTrackName}
            forcePlaying={isRadioPlaying}
            visualOnly={true}
          />
        </div>
      )}

      {/* 4. COMMUNITY TAB */}
      {activeTab === 'community' && (
        <div className="flex flex-col space-y-6 pb-20 px-4 animate-in fade-in slide-in-from-right-4 duration-500">
          <header className="pt-6">
            <h2 className="text-3xl font-black text-green-950 tracking-tighter italic-none">COMMUNITY</h2>
            <p className="text-[10px] font-bold text-green-600 uppercase tracking-[0.2em] italic-none">Voices of the Diaspora</p>
          </header>

          <section className="space-y-4">
            <div className="bg-white/60 backdrop-blur-md rounded-[2.5rem] p-4 border border-green-50 shadow-inner max-h-[400px] overflow-y-auto no-scrollbar space-y-4">
              {reports.length > 0 ? (
                reports.map((r, i) => (
                  <div key={i} className="bg-white p-5 rounded-3xl shadow-sm border border-green-50 relative animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[8px] font-black text-green-950 uppercase flex items-center italic-none">
                        <i className="fas fa-map-marker-alt mr-2 text-red-500"></i> {r.location}
                      </span>
                      <span className="text-[7px] font-mono text-gray-400 italic-none">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[11px] text-green-900 font-medium leading-relaxed italic-none">"{r.content}"</p>
                  </div>
                ))
              ) : (
                <div className="p-20 text-center opacity-20">
                  <i className="fas fa-users text-4xl mb-4"></i>
                  <p className="text-[10px] font-black uppercase tracking-widest italic-none">No one has spoken yet</p>
                </div>
              )}
            </div>

            <div className="bg-[#008751] p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-all"></div>
              <div className="relative z-10 space-y-4 text-center">
                <h3 className="text-xl font-black italic-none uppercase tracking-tighter">Your voice matters</h3>
                <p className="text-[9px] font-medium opacity-80 leading-relaxed italic-none">Report events, send greetings, or share updates from your city here.</p>
                {!isReporting ? (
                  <button
                    onClick={() => setIsReporting(true)}
                    className="w-full bg-white text-[#008751] py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-all italic-none"
                  >
                    <i className="fas fa-microphone-alt mr-2"></i> Click to broadcast
                  </button>
                ) : (
                  <form onSubmit={handleReport} className="space-y-3 animate-in zoom-in duration-300">
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      placeholder="What's happening?"
                      className="w-full bg-green-50/20 border border-white/20 rounded-2xl p-4 text-xs h-24 outline-none focus:bg-white/10 italic-none font-medium text-white placeholder:text-white/40"
                    />
                    <div className="flex space-x-2">
                      <button type="submit" className="flex-grow bg-white text-[#008751] py-3 rounded-xl font-black text-[9px] uppercase italic-none">Send</button>
                      <button type="button" onClick={() => setIsReporting(false)} className="px-6 bg-white/10 text-white py-3 rounded-xl text-[9px] font-black italic-none">X</button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Footer Branding (Static) */}
      <footer className="mt-auto px-4 py-8 text-center opacity-30">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-green-950 italic-none">{APP_NAME}</p>
        <p className="text-[7px] font-bold text-green-950/50 uppercase tracking-[0.5em] mt-2 italic-none">{DESIGNER_NAME} &bull; PREMIO v2.5</p>
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
