import { GoogleGenAI, Type } from "@google/genai";
import { Answers, Question, YearSummary } from "../types";
import { QUESTIONS } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash";

// Helper to clean JSON string from Markdown code blocks
const cleanJsonString = (str: string): string => {
  if (!str) return "";
  return str.replace(/```json/g, "").replace(/```/g, "").trim();
};

export const getInspiration = async (question: Question): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `Context: User is reflecting on their year by answering: "${question.text}".
      Task: Provide a very short, gentle, and warm thought starter. 
      Tone: Like a close friend whispering a reminder. Poetic but simple. NOT robotic. 
      Do NOT say "You can write about...". Just give the thought directly.
      Language: Chinese. Max 20 words.`,
    });
    return response.text?.replace(/["""]/g, '') || "闭上眼睛，答案就在呼吸之间...";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "听听心底的声音...";
  }
};

export const extractAnswersFromData = async (base64Data: string, mimeType: string): Promise<Answers> => {
  const questionsList = QUESTIONS.map(q => `${q.id}. ${q.text}`).join("\n");
  
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

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType || 'text/plain' // Fallback for safety
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             list: {
               type: Type.ARRAY,
               items: {
                 type: Type.OBJECT,
                 properties: {
                   id: { type: Type.NUMBER, description: "The Question ID (1-40)" },
                   answer: { type: Type.STRING, description: "The extracted answer text" }
                 },
                 required: ["id", "answer"]
               }
             }
          }
        }
      }
    });

    const jsonText = cleanJsonString(response.text || "");
    if (!jsonText) throw new Error("No response text");
    
    const result = JSON.parse(jsonText);
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
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                  keyword: { type: Type.STRING },
                  style: { type: Type.STRING, enum: ['ticket', 'paper', 'polaroid', 'note'] }
                },
                required: ["title", "content", "keyword", "style"]
              }
            },
            visualTags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            poem: { type: Type.STRING },
            analysis: { type: Type.STRING },
            keyword: { type: Type.STRING },
            animal: { type: Type.STRING }
          },
          required: ["cards", "visualTags", "poem", "analysis", "keyword", "animal"]
        }
      }
    });

    const jsonText = cleanJsonString(response.text || "");
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