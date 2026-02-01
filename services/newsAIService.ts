
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
  await dbService.cleanupOldNews();
  const existingNews = await dbService.getNews();

  return withRetry(async () => {
    const ai = getAIClient();
    console.log("Triggering live news scan via Gemini 2.0 Flash (Grounding enabled)...");

    const prompt = `Search for the most CURRENT breaking news (strictly last 24 hours) from global and Nigerian sources.
        ALSO, find the current weather conditions for ${locationLabel}.
        
        FOCUS AREAS:
        1. NIGERIA BREAKING: Politics and Economy.
        2. DIASPORA: Nigerian community updates worldwide.
        3. SPORTS: Latest Nigerian football/sports results.
        4. WEATHER: Current temp and sky conditions in ${locationLabel}.
        
        CRITICAL: Return EXACTLY a JSON object with this structure:
        {
          "news": [{"title": "Short Title", "content": "150-200 word detailed story", "category": "Nigeria|Sports|etc"}],
          "weather": {"condition": "Description", "temp": "XX°C", "location": "City Name"}
        }`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }] as any,
        },
      });

      const text = response.text || "{}";
      console.log("AI Raw Response:", text);

      // Extract JSON from potential markdown blocks
      let jsonStr = text;
      if (text.includes('```')) {
        const matches = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (matches && matches[1]) {
          jsonStr = matches[1];
        }
      }

      const data = JSON.parse(jsonStr);
      console.log("AI Parsed Data:", data);

      const processedNews: NewsItem[] = (data.news || []).map((item: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        title: item.title,
        content: item.content,
        category: item.category as any,
        timestamp: Date.now()
      }));

      if (processedNews.length > 0) {
        console.log(`Successfully fetched ${processedNews.length} news items. Storing to Supabase...`);
        await dbService.saveNews(processedNews);
      }

      return {
        news: processedNews,
        weather: data.weather
      };
    } catch (error) {
      console.error("Advanced News/Weather scanning failed", error);

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
  });
}
