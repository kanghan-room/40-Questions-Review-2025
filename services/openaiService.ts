import OpenAI from "openai";
import { Answers, Question, YearSummary } from "../types";
import { QUESTIONS } from "../constants";

// Resolve env vars at module init so Vite injects .env.local values at build/dev time.
const metaEnv = (import.meta as any)?.env ?? {};
const nodeEnv = typeof process !== "undefined" ? (process as any).env : undefined;
const globalEnv = (globalThis as any) ?? {};

const API_KEY =
  metaEnv.VITE_BIGMODEL_API_KEY ||
  metaEnv.VITE_OPENAI_API_KEY ||
  metaEnv.OPENAI_API_KEY ||
  metaEnv.API_KEY ||
  nodeEnv?.VITE_BIGMODEL_API_KEY ||
  nodeEnv?.VITE_OPENAI_API_KEY ||
  nodeEnv?.OPENAI_API_KEY ||
  nodeEnv?.API_KEY ||
  globalEnv.VITE_BIGMODEL_API_KEY ||
  globalEnv.VITE_OPENAI_API_KEY ||
  globalEnv.OPENAI_API_KEY ||
  globalEnv.API_KEY;

const BASE_URL =
  metaEnv.VITE_BIGMODEL_BASE_URL ||
  metaEnv.VITE_OPENAI_BASE_URL ||
  metaEnv.OPENAI_BASE_URL ||
  nodeEnv?.VITE_BIGMODEL_BASE_URL ||
  nodeEnv?.VITE_OPENAI_BASE_URL ||
  nodeEnv?.OPENAI_BASE_URL ||
  globalEnv.VITE_BIGMODEL_BASE_URL ||
  globalEnv.VITE_OPENAI_BASE_URL ||
  globalEnv.OPENAI_BASE_URL ||
  "https://open.bigmodel.cn/api/paas/v4/";

const MODEL =
  metaEnv.VITE_OPENAI_MODEL ||
  metaEnv.OPENAI_MODEL ||
  nodeEnv?.VITE_OPENAI_MODEL ||
  nodeEnv?.OPENAI_MODEL ||
  globalEnv.VITE_OPENAI_MODEL ||
  globalEnv.OPENAI_MODEL ||
  "glm-4-flash";

const getModel = () => MODEL;

const sanitizeBaseURL = (url: string): string => {
  // Avoid double appending `/chat/completions` by trimming if user passed a full endpoint.
  return url.replace(/\/chat\/completions\/?$/i, "/");
};

let ai: OpenAI | null = null;
let cachedApiKey: string | undefined;
let cachedBaseURL: string | undefined;

const getClient = () => {
  const apiKey = API_KEY;
  if (!apiKey) {
    throw new Error("Missing OpenAI API key. Please set VITE_BIGMODEL_API_KEY in .env.local.");
  }

  const baseURL = sanitizeBaseURL(BASE_URL);

  if (!ai || apiKey !== cachedApiKey || baseURL !== cachedBaseURL) {
    ai = new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true,
    });
    cachedApiKey = apiKey;
    cachedBaseURL = baseURL;
  }

  return ai;
};

// Helper to clean JSON string from Markdown code blocks
const cleanJsonString = (str: string): string => {
  if (!str) return "";
  return str.replace(/```json/g, "").replace(/```/g, "").trim();
};

const getTextFromContent = (
  content: string | Array<{ type: string; text?: string }>
): string => {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text || "" : ""))
    .join("\n")
    .trim();
};

const decodeBase64ToText = (base64: string): string => {
  if (!base64) return "";
  try {
    // In browsers, atob returns a Latin-1 string; decode bytes with UTF-8 to avoid mojibake.
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    try {
      return Buffer.from(base64, "base64").toString("utf-8");
    } catch {
      return "";
    }
  }
};

const buildFallbackAnswers = (text: string): Answers => {
  const clean = text?.trim();
  if (!clean) return {};
  // Place entire content under Q1 as a minimal fallback so the app can proceed.
  return { 1: clean };
};

// Parse plain text following the demo format: "1. Question\n\nAnswer\n\n2. ..."
const parsePlainTextAnswers = (text: string): Answers => {
  if (!text) return {};
  const cleaned = text.replace(/\r\n/g, "\n");

  const regex =
    /(\d{1,2})\.\s*[^\n]*\n+([\s\S]*?)(?=\n\d{1,2}\.\s|\nPart\s*\d+\.|$)/g;
  const answers: Answers = {};

  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    const id = Number(match[1]);
    if (!id || id < 1 || id > 40) continue;
    const answer = match[2].trim();
    if (answer) {
      answers[id] = answer;
    }
  }

  return answers;
};

export const getInspiration = async (question: Question): Promise<string> => {
  const model = getModel();
  try {
    const response = await getClient().chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are a close friend offering tiny, poetic nudges. Keep it under 20 Chinese characters, no quotes or prefacing.",
        },
        {
          role: "user",
          content: `Context: User is reflecting on their year by answering: "${question.text}". Return one gentle thought starter.`,
        },
      ],
    });

    const text = getTextFromContent(response.choices[0]?.message?.content || "");
    return text.replace(/["“”]/g, "") || "闭上眼睛，答案就在呼吸之间...";
  } catch (error) {
    console.error("OpenAI Inspiration Error:", error);
    return "听听心底的声音...";
  }
};

export const extractAnswersFromData = async (base64Data: string, mimeType: string): Promise<Answers> => {
  const questionsList = QUESTIONS.map(q => `${q.id}. ${q.text}`).join("\n");
  const model = getModel();
  
  const prompt = `
    Task: Extract answers from the provided user document (which may be an image, PDF, or text).
    The document contains answers to a specific "Year in Review" questionnaire.
    
    Here are the 40 Reference Questions:
    ${questionsList}

    Instructions:
    1. Analyze the document to find answers corresponding to these questions.
    2. Map the answers to the correct Question ID.
    3. Return a list of objects containing the Question ID and the Answer.
    4. If a question is not answered in the document, ignore it.
    
    Output Format: JSON.
  `;

  const isImage = mimeType?.startsWith("image/");
  const dataUrl = `data:${mimeType || "text/plain"};base64,${base64Data}`;
  const textPayload = !isImage ? decodeBase64ToText(base64Data) : "";
  const truncatedText = textPayload ? textPayload.slice(0, 8000) : "";

  // For plain text uploads, skip LLM parsing and just return the raw content.
  if (!isImage && textPayload && mimeType?.startsWith("text/")) {
    const parsed = parsePlainTextAnswers(textPayload);
    if (Object.keys(parsed).length > 0) return parsed;
    return buildFallbackAnswers(textPayload);
  }

  try {
    const response = await getClient().chat.completions.create({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You extract answers from the provided material and return ONLY valid JSON following the given schema.",
        },
        {
          role: "user",
          content: [
            ...(isImage
              ? [
                  {
                    type: "image_url",
                    image_url: { url: dataUrl },
                  } as const,
                ]
              : []),
            {
              type: "text",
              text: `${prompt}\n\n${
                truncatedText ? `Document (text or OCR expected):\n${truncatedText}` : ""
              }`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "answer_extraction",
          schema: {
            type: "object",
            properties: {
              list: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number", description: "The Question ID (1-40)" },
                    answer: { type: "string", description: "The extracted answer text" },
                  },
                  required: ["id", "answer"],
                },
              },
            },
            required: ["list"],
          },
        },
      },
    });

    const jsonText = cleanJsonString(
      getTextFromContent(response.choices[0]?.message?.content || "")
    );
    if (!jsonText) throw new Error("No response text");
    
    let result: any;
    try {
      result = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn("Extraction JSON parse failed, returning raw text.", parseError);
      return buildFallbackAnswers(textPayload || jsonText);
    }
    const answerList = result.list || [];

    // Convert list to map
    const formattedAnswers: Answers = {};
    answerList.forEach((item: any) => {
      if (item.id && item.answer) {
        formattedAnswers[item.id] = String(item.answer);
      }
    });

    return formattedAnswers;

  } catch (error) {
    console.error("Extraction Error", error);
    const fallback = buildFallbackAnswers(textPayload);
    if (Object.keys(fallback).length > 0) return fallback;
    throw error;
  }
};

export const generateYearSummary = async (answers: Answers, questions: Question[]): Promise<YearSummary> => {
  // Prepare the transcript
  let transcript = "User's Year in Review:\n";
  questions.forEach(q => {
    const answer = answers[q.id] || "Skipped";
    transcript += `[Category: ${q.category}] Q: ${q.text}\nA: ${answer}\n\n`;
  });

  const prompt = `
    You are a soulful writer and artist creating a scrapbooking kit for the user's year-end review.
    
    Your task: 
    1. Create 4 distinct, beautifully written summary cards.
    2. Identify visual elements for stickers.
    3. Write a short poem and an analysis for a year-end report.
    4. Choose a "Spirit Animal" and a "Theme Keyword" for the year.
    
    Guidelines:
    1. **Cards**:
       - Tone: Warm, nostalgic, slightly melancholic but hopeful. Like a letter from a past self.
       - Variety:
         * One about their external journey (places, events).
         * One about their internal emotions (gains, losses).
         * One about their tastes (books, music, small joys).
         * One about their future self.
    2. **Visual Tags (Stickers)**:
       - Analyze the user's answers to find concrete nouns (e.g., "coffee", "cat", "plane", "camera", "rain", "book", "beer", "guitar").
       - Return a list of 5-8 English keywords that represent these items. These will be converted into visual stickers.
    3. **Report**:
       - Poem: A short, abstract 4-line poem about their year (Chinese).
       - Analysis: A psychological analysis of their year (Chinese, ~100 words).
       - Animal: A spirit animal representing them.
       - Keyword: One main English keyword for the whole year (e.g., REBIRTH).

    Output JSON Format:
    {
      "cards": [
        {
          "title": "A creative 4-character Chinese title (e.g., 步履不停)",
          "content": "A short, evocative paragraph (40-60 words). Use '你' (You).",
          "keyword": "One English Word (e.g., BLOOM)",
          "style": "Choose strictly one: 'ticket', 'paper', 'polaroid', 'note'"
        }
      ],
      "visualTags": ["coffee", "camera", "cat"...],
      "poem": "...",
      "analysis": "...",
      "keyword": "...",
      "animal": "..."
    }

    Transcript:
    ${transcript}
  `;

  try {
    const model = getModel();
    const response = await getClient().chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are a soulful writer and concise JSON generator. Respond ONLY with JSON per schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "year_summary",
          schema: {
            type: "object",
            properties: {
              cards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    content: { type: "string" },
                    keyword: { type: "string" },
                    style: {
                      type: "string",
                      enum: ["ticket", "paper", "polaroid", "note"],
                    },
                  },
                  required: ["title", "content", "keyword", "style"],
                },
              },
              visualTags: {
                type: "array",
                items: { type: "string" },
              },
              poem: { type: "string" },
              analysis: { type: "string" },
              keyword: { type: "string" },
              animal: { type: "string" },
            },
            required: ["cards", "visualTags", "poem", "analysis", "keyword", "animal"],
          },
        },
      },
    });

    const jsonText = cleanJsonString(
      getTextFromContent(response.choices[0]?.message?.content || "")
    );
    if (!jsonText) throw new Error("No response from AI");
    
    return JSON.parse(jsonText) as YearSummary;

  } catch (error) {
    console.error("Summary Generation Error", error);
    // Fallback
    return {
      cards: [
        { title: "时光邮戳", content: "这一年的车票你已集齐，每一站的风雨都化作了此刻的云淡风轻。", keyword: "JOURNEY", style: "ticket" },
        { title: "且听风吟", content: "那些深夜的辗转反侧，终将成为你盔甲上最坚硬的鳞片。", keyword: "GROWTH", style: "paper" },
        { title: "瞬息宇宙", content: "在书页与旋律的缝隙里，你找到了那个不被世俗打扰的自己。", keyword: "SOUL", style: "polaroid" },
        { title: "未完待续", content: "故事的下一章，笔依然在你手中。愿你依然热泪盈眶。", keyword: "FUTURE", style: "note" },
      ],
      visualTags: ["star", "heart", "camera"],
      poem: "岁月无声流转，\n星河长明依然。\n回首往事如烟，\n步履不停向前。",
      analysis: "这一年你经历了很多...",
      keyword: "LIFE",
      animal: "Deer"
    };
  }
};
