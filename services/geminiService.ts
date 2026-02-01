import { GoogleGenAI } from "@google/genai";

export const getAIClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) console.warn("Gemini API Key missing!");
  return new GoogleGenAI(apiKey || 'INVALID_KEY');
};

/**
 * Generic retry wrapper for API calls to handle rate limits and temporary failures.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error?.message?.includes('429') || error?.status === 429;
    if (retries > 0 && (isRateLimit || error?.status >= 500)) {
      console.warn(`API error detected. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateText(prompt: string, systemInstruction: string) {
  return withRetry(async () => {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
        topK: 64,
        topP: 0.95,
      },
    });
    return response.text || "";
  });
}