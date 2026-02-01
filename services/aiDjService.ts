
import { GoogleGenAI, Modality } from "@google/genai";
import { generateText, getAIClient, withRetry } from './geminiService';
import { dbService } from './dbService';
import { DjScript, NewsItem } from '../types';
import { NEWSCASTER_NAME, APP_NAME } from '../constants';
import { WeatherData } from './newsAIService';

export async function generateDjSegment(): Promise<DjScript> {
  return withRetry(async () => {
    const prompt = `Write a 15-second radio bridge for ${APP_NAME}. 
    Host: ${NEWSCASTER_NAME}. 
    Mention the diaspora community and our voice abroad. Keep it high energy and warm.`;

    const systemInstruction = `You are ${NEWSCASTER_NAME}, the voice of ${APP_NAME}. Your tone is professional, sophisticated, and distinctively Nigerian.`;

    const scriptText = await generateText(prompt, systemInstruction);
    const djScript: DjScript = {
      id: Math.random().toString(36).substr(2, 9),
      script: scriptText,
      timestamp: Date.now()
    };
    await dbService.addScript(djScript);
    return djScript;
  });
}

export async function getDetailedBulletinAudio(params: {
  location: string;
  localTime: string;
  newsItems: NewsItem[];
  weather?: WeatherData;
  isBrief?: boolean;
}): Promise<Uint8Array | null> {
  return withRetry(async () => {
    const ai = getAIClient();
    const { location, localTime, newsItems, weather, isBrief } = params;

    let fullScript = "";

    if (isBrief) {
      // Half-hour Headline Update
      fullScript = `This is a 60-second NDR Headline Update. I am ${NEWSCASTER_NAME}. `;
      if (weather) {
        fullScript += `Currently in ${weather.location}, it's ${weather.condition} at ${weather.temp}. `;
      }
      fullScript += `Here are the latest headlines: `;
      newsItems.forEach((n, i) => {
        fullScript += `${i + 1}: ${n.title}. `;
      });
      fullScript += `For the full stories, join us at the top of the hour. This is ${APP_NAME}.`;
    } else {
      // Top of the Hour Detailed Bulletin
      fullScript = `This is ${NEWSCASTER_NAME} with the ${APP_NAME} Detailed News Bulletin. The time is ${localTime} in ${location}. `;

      if (weather) {
        fullScript += `Taking a look at the weather, in ${weather.location} we are seeing ${weather.condition} with a temperature of ${weather.temp}. `;
      }

      fullScript += `Our top stories this hour: `;
      newsItems.forEach((n, i) => {
        fullScript += `${n.title}. ${n.content} `;
      });

      fullScript += `That is the detailed news and weather for now. I am ${NEWSCASTER_NAME}. Stay tuned for more sounds of home on NDR.`;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ parts: [{ text: fullScript }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (base64Audio) return decode(base64Audio);
      return null;
    } catch (error) {
      console.error("Bulletin TTS failed", error);
      return null;
    }
  });
}

export async function getNewsAudio(newsContent: string): Promise<Uint8Array | null> {
  return withRetry(async () => {
    const ai = getAIClient();
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ parts: [{ text: newsContent }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (base64Audio) return decode(base64Audio);
      return null;
    } catch (error) {
      console.error("TTS failed", error);
      return null;
    }
  });
}

export async function getJingleAudio(jingleText: string): Promise<Uint8Array | null> {
  const cacheKey = `jingle_${btoa(jingleText).substring(0, 32)}`;
  const cached = await dbService.getCachedAudio(cacheKey);
  if (cached) return cached;

  return withRetry(async () => {
    const ai = getAIClient();
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ parts: [{ text: jingleText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (base64Audio) {
        const bytes = decode(base64Audio);
        await dbService.setCachedAudio(cacheKey, bytes);
        return bytes;
      }
      return null;
    } catch (error) {
      console.error("Jingle TTS failed", error);
      return null;
    }
  });
}

function decode(base64: string) {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decode failed", e);
    return new Uint8Array(0);
  }
}
