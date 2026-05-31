
import { GoogleGenAI, Modality, Type, GenerateContentResponse } from "@google/genai";
import { CharacterId, Character } from "../types";
import { SYSTEM_PROMPTS } from "../constants";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeDocument = async (file: File): Promise<string> => {
  const ai = getAI();
  const base64Data = await fileToBase64(file);
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          { inlineData: { data: base64Data, mimeType: file.type } },
          { text: "Please extract the full text and key information from this document for our study session. Format it clearly for reading." }
        ]
      }
    ]
  });

  return response.text || "Could not extract text.";
};

export const generateQuiz = async (docContent: string, character: Character) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Based on the following document, create a 3-question multiple choice quiz. Return ONLY a JSON object in this format: 
    { "quiz": [ { "question": "...", "options": ["...", "...", "..."], "answerIndex": 0, "explanation": "..." } ] }
    Stay in character as ${character.name} for the explanation text.
    
    Document: ${docContent.substring(0, 5000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                answerIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
              },
              required: ["question", "options", "answerIndex", "explanation"]
            }
          }
        },
        required: ["quiz"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}').quiz;
  } catch (e) {
    console.error("Failed to parse quiz", e);
    return [];
  }
};

export const chatWithAssistant = async (
  character: Character,
  message: string,
  docContent: string,
  history: any[] = []
) => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `${SYSTEM_PROMPTS[character.id as keyof typeof SYSTEM_PROMPTS]} You have access to the following document content: \n\n ${docContent.substring(0, 15000)}`,
    }
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};

export const generateTTS = async (text: string, character: Character, overrideVoice?: string): Promise<Uint8Array | null> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say as ${character.name}: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: overrideVoice || character.voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return decodeBase64ToUint8(base64Audio);
    }
  } catch (error) {
    console.error("TTS generation failed:", error);
  }
  return null;
};

// Helpers
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
};

function decodeBase64ToUint8(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
