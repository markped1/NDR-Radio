
import { scanNigerianNewspapers } from './newsAIService';
import { getDetailedBulletinAudio, getJingleAudio } from './aiDjService';
import { dbService } from './dbService';

const JINGLE_1 = "This is Nigeria Diaspora Radio. The voice of Nigeria abroad.";
const JINGLE_2 = "You're listening to NDR. Stay tuned for more.";

export interface BroadcastSchedulerConfig {
    onPlayAudio: (pcmData: Uint8Array, type: 'news' | 'jingle') => Promise<void>;
    currentLocation: string;
    enabled: boolean;
}

let schedulerInterval: NodeJS.Timeout | null = null;
let lastBroadcastMinute = -1;

/**
 * Initialize the broadcast scheduler
 * Checks every minute for broadcast times:
 * - XX:00 = Full bulletin (5-7 news items with full content)
 * - XX:30 = Headlines only (titles only)
 */
export function initBroadcastScheduler(config: BroadcastSchedulerConfig) {
    if (schedulerInterval) {
        console.log("[NDR BROADCAST] Scheduler already running");
        return;
    }

    console.log("[NDR BROADCAST] Initializing broadcast scheduler...");

    // Check every minute
    schedulerInterval = setInterval(async () => {
        if (!config.enabled) return;

        const now = new Date();
        const currentMinute = now.getMinutes();
        const currentHour = now.getHours();

        // Prevent duplicate broadcasts in the same minute
        if (currentMinute === lastBroadcastMinute) return;

        // Top of the hour: Full bulletin
        if (currentMinute === 0) {
            lastBroadcastMinute = currentMinute;
            console.log(`[NDR BROADCAST] Triggering full bulletin at ${currentHour}:00`);
            await triggerFullBulletin(config);
        }
        // Half hour: Headlines only
        else if (currentMinute === 30) {
            lastBroadcastMinute = currentMinute;
            console.log(`[NDR BROADCAST] Triggering headlines at ${currentHour}:30`);
            await triggerHeadlines(config);
        }
        // Reset last broadcast minute after passing the trigger times
        else if (currentMinute !== 0 && currentMinute !== 30) {
            lastBroadcastMinute = -1;
        }
    }, 60000); // Check every 60 seconds

    console.log("[NDR BROADCAST] Scheduler started successfully");
}

/**
 * Stop the broadcast scheduler
 */
export function stopBroadcastScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log("[NDR BROADCAST] Scheduler stopped");
    }
}

/**
 * Trigger a full news bulletin (top of hour)
 */
async function triggerFullBulletin(config: BroadcastSchedulerConfig) {
    try {
        // Fetch latest news
        const { news, weather } = await scanNigerianNewspapers(config.currentLocation);

        if (news.length === 0) {
            console.warn("[NDR BROADCAST] No news available for full bulletin");
            return;
        }

        // Play intro jingle
        const introJingle = await getJingleAudio(JINGLE_1);
        if (introJingle) {
            await config.onPlayAudio(introJingle, 'jingle');
        }

        // Generate full bulletin audio (5-7 news items with full content)
        const bulletinAudio = await getDetailedBulletinAudio({
            location: config.currentLocation,
            localTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            newsItems: news.slice(0, 7),
            weather: weather,
            isBrief: false // Full bulletin
        });

        if (bulletinAudio) {
            await config.onPlayAudio(bulletinAudio, 'news');

            // Log broadcast
            dbService.addLog({
                id: Date.now().toString(),
                action: `Full Bulletin broadcast at ${new Date().toLocaleTimeString()}`,
                timestamp: Date.now()
            });
        }

        // Play outro jingle
        const outroJingle = await getJingleAudio(JINGLE_2);
        if (outroJingle) {
            await config.onPlayAudio(outroJingle, 'jingle');
        }

        console.log("[NDR BROADCAST] Full bulletin completed successfully");
    } catch (error) {
        console.error("[NDR BROADCAST] Full bulletin failed:", error);
    }
}

/**
 * Trigger headlines only (half hour)
 */
async function triggerHeadlines(config: BroadcastSchedulerConfig) {
    try {
        // Fetch latest news
        const { news, weather } = await scanNigerianNewspapers(config.currentLocation);

        if (news.length === 0) {
            console.warn("[NDR BROADCAST] No news available for headlines");
            return;
        }

        // Play intro jingle
        const introJingle = await getJingleAudio(JINGLE_1);
        if (introJingle) {
            await config.onPlayAudio(introJingle, 'jingle');
        }

        // Generate headlines audio (titles only, brief)
        const headlinesAudio = await getDetailedBulletinAudio({
            location: config.currentLocation,
            localTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            newsItems: news.slice(0, 5),
            weather: weather,
            isBrief: true // Headlines only
        });

        if (headlinesAudio) {
            await config.onPlayAudio(headlinesAudio, 'news');

            // Log broadcast
            dbService.addLog({
                id: Date.now().toString(),
                action: `Headlines broadcast at ${new Date().toLocaleTimeString()}`,
                timestamp: Date.now()
            });
        }

        // Play outro jingle
        const outroJingle = await getJingleAudio(JINGLE_2);
        if (outroJingle) {
            await config.onPlayAudio(outroJingle, 'jingle');
        }

        console.log("[NDR BROADCAST] Headlines completed successfully");
    } catch (error) {
        console.error("[NDR BROADCAST] Headlines failed:", error);
    }
}

/**
 * Manually trigger a broadcast (for admin use)
 */
export async function manualBroadcast(config: BroadcastSchedulerConfig, isBrief: boolean = false) {
    console.log(`[NDR BROADCAST] Manual ${isBrief ? 'headlines' : 'full bulletin'} triggered`);

    if (isBrief) {
        await triggerHeadlines(config);
    } else {
        await triggerFullBulletin(config);
    }
}
