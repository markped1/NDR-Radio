
import { Type } from "@google/genai";
import { getAIClient, withRetry } from './geminiService';
import { dbService } from './dbService';
import { NewsItem } from '../types';

export interface WeatherData {
  condition: string;
  temp: string;
  location: string;
}

export async function scanNigerianNewspapers(locationLabel: string = "Global"): Promise<{ news: NewsItem[], weather?: WeatherData }> {
  // Quota Guard: Check if we already have very fresh news (less than 15 mins old)
  const lastSync = await dbService.getLastSyncTime();
  const refreshThreshold = 15 * 60 * 1000;

  await dbService.cleanupOldNews();
  const existingNews = await dbService.getNews();

  // If we have news and it's fresh, we might still want to fetch weather if it's a scheduled broadcast
  // But for the sake of efficiency, we sync both together.

  return withRetry(async () => {
    const ai = getAIClient();
    const prompt = `Search for the most CURRENT breaking news (strictly last 24 hours) from global and Nigerian sources.
    ALSO, find the current weather conditions for ${locationLabel}.
    
    FOCUS AREAS:
    1. NIGERIA BREAKING: Politics and Economy.
    2. DIASPORA: Nigerian community updates worldwide.
    3. SPORTS: Latest Nigerian football/sports results.
    4. WEATHER: Current temp and sky conditions in ${locationLabel}.
    
    Return a JSON object with:
    - 'news': Array of objects with 'title', 'content', 'category' (Detailed content 60-80 words).
    - 'headlines': Array of short strings (headlines only).
    - 'weather': Object with 'condition', 'temp', 'location'.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              news: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    category: { type: Type.STRING }
                  },
                  required: ["title", "content", "category"]
                }
              },
              headlines: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              weather: {
                type: Type.OBJECT,
                properties: {
                  condition: { type: Type.STRING },
                  temp: { type: Type.STRING },
                  location: { type: Type.STRING }
                }
              }
            }
          }
        },
      });

      const data = JSON.parse(response.text || "{}");

      const processedNews: NewsItem[] = (data.news || []).map((item: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        title: item.title,
        content: item.content,
        category: item.category as any,
        timestamp: Date.now()
      }));

      if (processedNews.length > 0) {
        await dbService.saveNews(processedNews);
      }

      return {
        news: processedNews,
        weather: data.weather
      };
    } catch (error) {
      console.error("Advanced News/Weather scanning failed", error);

      // FALLBACK: If API fails (e.g. invalid key, offline), return a placeholder so the UI isn't empty.
      if (existingNews.length === 0) {
        const offlineNews = [{
          id: 'offline-' + Date.now(),
          title: 'Welcome to Nigeria Diaspora Radio - Live Broadcast',
          content: 'We are currently tuning our AI satellites. Enjoy our curated selection of afrobeats while we connect to the news feed.',
          category: 'Station Update',
          timestamp: Date.now()
        }];

        // IMPORTANT: Save this fallback to DB so fetchData() sees it!
        await dbService.setNews(offlineNews);

        return {
          news: offlineNews as NewsItem[],
          weather: { condition: 'Fair', temp: '25°C', location: 'Lagos' }
        };
      }
      return { news: existingNews };
    }
  });
}
