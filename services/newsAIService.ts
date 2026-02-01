
import { dbService } from './dbService';
import { NewsItem } from '../types';

export interface WeatherData {
  condition: string;
  temp: string;
  location: string;
}

const NEWSDATA_API_KEY = import.meta.env.VITE_NEWSDATA_API_KEY;
const NEWSDATA_BASE_URL = 'https://newsdata.io/api/1/news';

export async function scanNigerianNewspapers(locationLabel: string = "Global"): Promise<{ news: NewsItem[], weather?: WeatherData }> {
  await dbService.cleanupOldNews();
  const existingNews = await dbService.getNews();

  // Check if API key is available
  if (!NEWSDATA_API_KEY || NEWSDATA_API_KEY === 'INVALID_KEY' || NEWSDATA_API_KEY === 'YOUR_NEWSDATA_API_KEY_HERE') {
    console.warn("[NDR NEWS] NewsData.io API key missing. Using cached news.");
    return { news: existingNews };
  }

  try {
    console.log("[NDR NEWS] Auto-scanning Nigerian and diaspora news...");

    // Fetch Nigerian news
    const nigeriaUrl = `${NEWSDATA_BASE_URL}?apikey=${NEWSDATA_API_KEY}&country=ng&language=en`;

    // Fetch diaspora-related news (search for "Nigerian diaspora" globally)
    const diasporaUrl = `${NEWSDATA_BASE_URL}?apikey=${NEWSDATA_API_KEY}&q=Nigerian%20diaspora&language=en`;

    const [nigeriaResponse, diasporaResponse] = await Promise.all([
      fetch(nigeriaUrl).catch(() => null),
      fetch(diasporaUrl).catch(() => null)
    ]);

    let allNewsItems: any[] = [];

    // Process Nigerian news
    if (nigeriaResponse?.ok) {
      const nigeriaData = await nigeriaResponse.json();
      const nigeriaItems = (nigeriaData.results || []).map((item: any) => ({
        ...item,
        source_category: 'Nigeria'
      }));
      allNewsItems.push(...nigeriaItems);
      console.log(`[NDR NEWS] Fetched ${nigeriaItems.length} Nigerian news items`);
    }

    // Process diaspora news
    if (diasporaResponse?.ok) {
      const diasporaData = await diasporaResponse.json();
      const diasporaItems = (diasporaData.results || []).map((item: any) => ({
        ...item,
        source_category: 'Diaspora'
      }));
      allNewsItems.push(...diasporaItems);
      console.log(`[NDR NEWS] Fetched ${diasporaItems.length} diaspora news items`);
    }

    // Process and deduplicate news items
    const processedNews: NewsItem[] = allNewsItems
      .slice(0, 20) // Limit to 20 most recent
      .map((item: any) => ({
        id: item.article_id || Math.random().toString(36).substr(2, 9),
        title: item.title || 'Untitled',
        content: item.description || item.content || 'No content available',
        category: item.source_category || item.category?.[0] || 'General',
        timestamp: new Date(item.pubDate).getTime() || Date.now()
      }));

    if (processedNews.length > 0) {
      console.log(`[NDR NEWS] Successfully processed ${processedNews.length} total news items. Storing to database...`);
      await dbService.saveNews(processedNews);

      return {
        news: processedNews,
        weather: { condition: 'Fair', temp: '25°C', location: locationLabel }
      };
    }

    // If no news fetched, return existing
    console.warn("[NDR NEWS] No new news items fetched, using cached news");
    return { news: existingNews };

  } catch (error) {
    console.error("[NDR NEWS] NewsData.io fetch failed:", error);

    // Fallback to offline news if no existing news
    if (existingNews.length === 0) {
      const offlineNews = [{
        id: 'offline-' + Date.now(),
        title: 'Welcome to Nigeria Diaspora Radio - Live Broadcast',
        content: 'We are currently tuning our AI satellites. Enjoy our curated selection of afrobeats while we connect to the news feed.',
        category: 'Station Update',
        timestamp: Date.now()
      }];

      await dbService.setNews(offlineNews as NewsItem[]);

      return {
        news: offlineNews as NewsItem[],
        weather: { condition: 'Fair', temp: '25°C', location: 'Lagos' }
      };
    }

    return { news: existingNews };
  }
}
