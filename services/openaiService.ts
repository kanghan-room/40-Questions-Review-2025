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
    /(?:^|\n)(\d{1,2})\.\s*[^\n]*\n+([\s\S]*?)(?=(?:\n\d{1,2}\.\s|\nPart\s*\d+\.)|$)/g;
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
  // Prepare the transcript with detailed context
  let transcript = "User's Year in Review:\n";
  
  // Categorize answers by type for better AI understanding
  const categorizedAnswers: { [key: string]: { question: string; answer: string }[] } = {
    journey: [],
    emotions: [],
    tastes: [],
    future: []
  };

  questions.forEach(q => {
    const answer = answers[q.id] || "Skipped";
    transcript += `[Category: ${q.category}] Q: ${q.text}\nA: ${answer}\n\n`;
    
    // Improved categorization logic for more accurate grouping
    if (q.id === 1 || q.id === 5 || q.category.includes("足迹") || q.category.includes("旅行") || q.category.includes("城市")) {
      categorizedAnswers.journey.push({ question: q.text, answer });
    } else if (q.id === 16 || q.id === 18 || q.id === 37 || q.id === 39 || q.category.includes("情感") || q.category.includes("变化") || q.category.includes("成长") || q.category.includes("思念")) {
      categorizedAnswers.emotions.push({ question: q.text, answer });
    } else if (q.id === 17 || q.id === 24 || q.id === 25 || q.id === 26 || q.id === 27 || q.id === 28 || q.category.includes("旋律") || q.category.includes("娱乐") || q.category.includes("阅读") || q.category.includes("味蕾")) {
      categorizedAnswers.tastes.push({ question: q.text, answer });
    } else if (q.id === 6 || q.id === 19 || q.id === 32 || q.id === 40 || q.category.includes("愿望") || q.category.includes("期待") || q.category.includes("总结")) {
      categorizedAnswers.future.push({ question: q.text, answer });
    }
  });

  // Add categorized context to help AI generate more targeted cards
  let categorizedContext = "\nCategorized User Answers for Summary Cards:\n";
  categorizedContext += `--- Journey (Places, Events) ---\n${categorizedAnswers.journey.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}\n\n`;
  categorizedContext += `--- Emotions (Growth, Reflections) ---\n${categorizedAnswers.emotions.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}\n\n`;
  categorizedContext += `--- Tastes (Joys, Preferences) ---\n${categorizedAnswers.tastes.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}\n\n`;
  categorizedContext += `--- Future (Aspirations) ---\n${categorizedAnswers.future.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}\n\n`;

  // Create a list of unique, specific details from the user's answers to emphasize uniqueness
  const uniqueDetails: string[] = [];
  Object.values(categorizedAnswers).forEach(category => {
    category.forEach(item => {
      if (item.answer !== "Skipped" && item.answer.trim().length > 0) {
        // Extract specific nouns, places, activities, etc.
        const details = item.answer.match(/[\u4e00-\u9fa5]{2,}|"[^"]+"|'[^']+'|[A-Za-z]+/g) || [];
        details.forEach(detail => {
          if (detail.trim().length > 1 && !uniqueDetails.includes(detail)) {
            uniqueDetails.push(detail);
          }
        });
      }
    });
  });

  const prompt = `
    You are a soulful writer and artist creating a scrapbooking kit for the user's year-end review. Your goal is to create a truly unique and personalized summary that perfectly captures this user's one-of-a-kind year.
    
    **CRITICAL UNIQUENESS REQUIREMENT**: Every single element of the summary cards MUST be 100% based on the user's actual answers and MUST reflect the unique details of their year. Before writing anything, you must:
    1. Identify 3-4 specific, unique details from the user's answers that no other user would have (e.g., "北京上海实习", "回春丹的《染春》", "不入耳的耳机")
    2. Ensure these details are concrete, verifiable, and completely specific to this user
    3. Weave these unique details into every card, making them the central focus of the narrative
    4. Avoid any generic phrases or concepts that could apply to anyone else
    
    First, conduct a systematic analysis and high-level abstraction of the user's answers:
    - **Systematic Summarization**: Organize answers into logical frameworks (e.g., time sequence, thematic clusters, cause-effect relationships)
    - **High-Level Abstraction**: Move beyond surface details to identify underlying patterns, core values, and fundamental growth trajectories
    - **Core Theme Extraction**: Distill 2-3 overarching themes that encapsulate the essence of their year
    - **Pattern Recognition**: Identify interconnected patterns across different experiences, emotions, and preferences
    - **Insight Generation**: Derive meaningful insights that reflect the user's evolving mindset and life philosophy
    
    **Critical Content Processing Rules**:
    - **Prohibit Direct Quotation**: Never copy entire sentences or paragraphs from user answers. Instead, rephrase and synthesize core information.
    - **Abstract Generalization**: Convert specific events into generalizable concepts while preserving unique identifiers. Example: Transform "北京上海实习" into "跨城市职业探索与成长"
    - **Core Information Preservation**: Ensure all critical details (specific places, events, emotions) are retained but presented in a condensed, abstracted form
    - **Higher-Dimension Perspective**: Frame experiences within broader contexts (e.g., personal growth journey, life transformation, values evolution)
    - **Terminology Handling**: Retain professional/unique terms (e.g., "回春丹的《染春》", "不入耳的耳机") but integrate them into abstract narratives

    Your task: 
    1. Create 4 distinct, beautifully written summary cards that are completely unique to this user.
    2. Identify visual elements that represent the user's specific experiences.
    3. Write a short poem and analysis that reflect the user's unique year.
    4. Choose a spirit animal and keyword that perfectly embody this user's experiences.
    
    Guidelines:
    1. **Cards**:
       - Tone: Match the user's unique expression style while maintaining profound warmth, poetic nostalgia, and hopeful resonance.
       - **Literary Excellence**: 
         * **Vivid Imagery**: Use sensory details (sight, sound, touch, smell, taste) to paint a rich, evocative tapestry of the user's year. For example: "胡同里的槐树清香" instead of "胡同里的树"
         * **Metaphorical Language**: Weave metaphors and similes seamlessly into the narrative. Examples: "青春如同一首未完成的诗" or "笑声如同风铃般清脆"
         * **Personification**: Breathe life into inanimate objects or abstract concepts. Example: "时光的脚步轻轻走过北京的胡同"
         * **Parallelism**: Use balanced sentence structures for rhythm and emphasis. Example: "在城市中奔跑，在书海中徜徉，在音乐中沉醉"
         * **Elegant Vocabulary**: Replace common words with more literary alternatives: "漫步" instead of "走"，"邂逅" instead of "遇到"，"静谧" instead of "安静"，"璀璨" instead of "明亮"
         * **Lyrical Phrasing**: Craft flowing sentences with varied rhythm and cadence, avoiding monotonous structure
         * **Atmospheric Writing**: Create an immersive atmosphere that transports the reader to the user's experiences, evoking their emotions through descriptive language
         * **Emotional Resonance**: Infuse the content with subtle emotional cues that reflect the user's true feelings, using words that convey depth and authenticity
       - **Enhanced Personalization**: Each card MUST contain at least 4 direct references to specific, unique details from the user's answers, weaving them into a cohesive narrative that captures the depth of their experiences.
         * **Verifiable**: The information must be explicitly stated in their answers
         * **Highly Specific**: Not generic observations but concrete details that no other user would have
         * **Central to the Narrative**: The entire card should revolve around these unique details
         * **Artful Integration**: Woven seamlessly into the poetic flow, not just listed
       - **Expanded Length**: Each card content should be 100-150 Chinese characters, providing ample space to develop a rich, multi-faceted narrative that integrates multiple aspects of the user's experiences.
       - **Comprehensive Synthesis**: Each card must synthesize 3-4 different key points from the user's answers related to its category, creating a holistic and deep representation of that aspect of their year.
       - **Emotional Resonance**: Infuse the content with emotional depth that reflects the user's true feelings and experiences
       - **STRICTLY PROHIBITED**:
         * **Direct Copying**: Any direct quotation of entire sentences or paragraphs from user answers
         * **Surface-Level Recounting**: Merely listing events without abstract synthesis
         * **Generic Statements**: Phrases that could apply to anyone
         * **Assumptions**: Content not explicitly supported by the user's answers
         * **Repetition**: Using the same details across multiple cards
         * **Over-Simplification**: Undeveloped narratives lacking depth or insight
       - **MANDATORY EVIDENCE**: Each card must highlight different unique details such as:
         * Exact places mentioned (e.g., "北京上海实习", "上海和北京的地图")
         * Specific activities (e.g., "在小红书上面分享一些东西", "和朋友去市中心吃饭逛街")
         * Purchases or possessions (e.g., "不入耳的耳机")
         * Media consumed (e.g., "《俗女养成记》", "回春丹的《染春》", "《傲慢与偏见》", "所有的说唱和摇滚")
         * Direct quotes of feelings (e.g., "对AI感到超级兴奋", "发过一次烧，但大病没有")
         * Exact goals stated (e.g., "钱，很多很多钱", "取得一个让所有人一听就会觉得'哇，你好厉害'的那样的成就")
         * Personal lessons learned (e.g., "要坚持做自己觉得正确的事情", "相信自己的相信，坚定自己的坚定")
       - **Complete Variety**: Each card must focus on a completely different aspect of the user's year:
           * One about their external journey (unique places, specific events they explicitly mentioned)
           * One about their internal emotions and growth (specific gains, reflections, or lessons they learned)
           * One about their unique tastes and small joys (specific books, music, food, or activities they enjoyed)
           * One about their future aspirations (based on their explicit, unique hopes and goals)
    2. **Visual Tags (Stickers)**:
       - Analyze the user's answers to find the most unique and specific concrete nouns (e.g., "实习", "染春", "火锅", "不入耳耳机", "胶片")
       - Return a list of 5-8 English keywords that represent these unique items
       - Avoid generic tags like "music" or "food" - use specific terms like "hiphop", "hotpot", "earbuds"
    3. **Report**:
       - Poem: A short, 4-line poem about their year (Chinese) that incorporates at least 2 unique details from their answers
       - Analysis: A psychological analysis of their year (Chinese, ~100 words) that focuses on their unique growth and key themes
       - Animal: A spirit animal that perfectly represents their unique personality and experiences this year
       - Keyword: One main English keyword that captures the unique essence of their year

    **Example of a HIGH-QUALITY, LITERARY Card**:
    {
      "title": "北漂沪上",
      "content": "这一年，你独自背起青春的行囊，在北漂与沪上的双城记里书写成长的篇章。北京的胡同里藏着你实习的汗水，上海的霓虹下印着你探索的足迹。在小红书的字里行间，你用镜头定格时光的温度，用文字倾诉成长的感悟，每一次选择都如星辰般明亮，指引你走向那句'坚持做自己觉得正确的事情'的人生箴言。",
      "keyword": "ADVENTURE",
      "style": "ticket"
    }

    **Example of a POOR, GENERIC Card (AVOID THIS!)**:
    {
      "title": "成长之路",
      "content": "这一年你经历了很多，成长了不少。你去了一些地方，学到了一些东西。未来充满希望，你会继续努力。",
      "keyword": "GROWTH",
      "style": "paper"
    }

    Output JSON Format:
    {
      "cards": [
        {
          "title": "A creative 4-character Chinese title that reflects unique details (e.g., 北漂沪上)",
          "content": "A short, evocative paragraph (40-60 words) filled with unique details from the user's answers. Use '你' (You).",
          "keyword": "One English Word that captures the unique essence of this card (e.g., ADVENTURE)",
          "style": "Choose strictly one: 'ticket', 'paper', 'polaroid', 'note'"
        }
      ],
      "visualTags": ["internship", "shanghai", "beijing", "hiphop", "hotpot"...],
      "poem": "...",
      "analysis": "...",
      "keyword": "...",
      "animal": "..."
    }

    Unique Details from User's Answers (USE THESE!):
    ${uniqueDetails.slice(0, 15).join(", ")}\n\n
    Categorized Context (to help create targeted summary cards):
    ${categorizedContext}

    Full Transcript of User's Answers:
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
    // 创建基于用户实际回答的个性化Fallback，避免内容同质化
    // 从用户回答中提取一些关键词
    const extractedKeywords = uniqueDetails.slice(0, 5);
    const hasJourney = categorizedAnswers.journey.some(a => a.answer !== "Skipped");
    const hasEmotions = categorizedAnswers.emotions.some(a => a.answer !== "Skipped");
    const hasTastes = categorizedAnswers.tastes.some(a => a.answer !== "Skipped");
    const hasFuture = categorizedAnswers.future.some(a => a.answer !== "Skipped");
    
    // 文学化词汇替换表
    const literaryVocab: { [key: string]: string } = {
      // 动词
    "去": "前往",
    "走": "漫步",
    "看": "凝望",
    "听": "聆听",
    "吃": "品尝",
    "喝": "啜饮",
    "玩": "徜徉",
    "做": "践行",
    "说": "倾诉",
    "想": "思忖",
    
      "笑": "嫣然",
      "哭": "潸然",
      "读": "品阅",
      "写": "挥毫",
      "旅行": "漫游",
      "成长": "蜕变",
      "变化": "流转",
      "发现": "邂逅",
      "感受": "体悟",
      "经历": "亲历",
      "寻找": "寻觅",
      "探索": "探幽",
      "创造": "缔造",
      "等待": "守望",
      "遇见": "邂逅",
      "离开": "挥别",
      // 形容词
      "好": "曼妙",
      "美": "旖旎",
      "大": "浩瀚",
      "小": "玲珑",
      "多": "纷繁",
      "少": "寥寥",
      "高": "巍峨",
      "低": "幽邃",
      "亮": "璀璨",
      "暗": "朦胧",
      "暖": "煦暖",
      "冷": "清冽",
      "快": "翩然",
      "慢": "悠然",
      "静": "静谧",
      "动": "灵动",
      "新": "崭然",
      "旧": "古朴",
      "甜": "甘醇",
      "苦": "清苦",
      "香": "馥郁",
      "臭": "腥膻",
      "累": "疲惫",
      "轻松": "惬意",
      // 名词
      "日子": "韶光",
      "季节": "时令",
      "天空": "苍穹",
      "花朵": "芳菲",
      "树木": "葱茏",
      "河流": "川流",
      "城市": "城邦",
      "乡村": "乡野",
      "房间": "轩窗",
      "道路": "阡陌",
      "回忆": "流年",
      "梦想": "愿景",
      "希望": "期许",
      "快乐": "欢愉",
      "悲伤": "哀思",
      "爱": "深情",
      "友谊": "莫逆",
      "幸福": "福祉",
      "成功": "丰功",
      "失败": "挫折",
      "经验": "阅历",
      "知识": "学识",
      // 副词
      "很": "甚",
      "非常": "尤为",
      "慢慢": "徐徐",
      "轻轻": "袅袅",
      "快速": "倏忽",
      "经常": "屡屡",
      "偶尔": "间或",
      "总是": "素来",
      "刚刚": "方才",
      "已经": "已然",
      "将要": "将欲",
      "可能": "或许",
      "一定": "定然",
      "真的": "诚然",
      "假的": "虚妄",
      // 常用词汇
      "喜欢": "钟爱",
      "开心": "欢愉",
      "难过": "惆怅",
      "思考": "思忖",
      "学习": "研习",
      "工作": "耕耘",
      "朋友": "挚友",
      "家人": "至亲",
      "地方": "秘境",
      "风景": "景致",
      "生活": "浮生",
      "时间": "时光"
    };
    
    // 应用文学化词汇替换
    const applyLiteraryVocab = (text: string): string => {
      let result = text;
      // 按词汇长度降序替换，避免短词汇影响长词汇
      Object.entries(literaryVocab)
        .sort(([a], [b]) => b.length - a.length)
        .forEach(([original, literary]) => {
          // 使用正则表达式进行单词边界匹配，避免部分替换
          const regex = new RegExp(`\\b${original}\\b`, 'g');
          result = result.replace(regex, literary);
        });
      return result;
    };
    
    // 从用户回答中提取并抽象关键信息，进行系统性总结
    const getRichContent = (category: any[]) => {
      const validAnswers = category.filter(a => a.answer !== "Skipped" && a.answer.trim().length > 0);
      if (validAnswers.length === 0) return "";
      
      // 系统性分析：识别核心主题和模式
      const analyzeAnswers = (answers: any[]) => {
        const themes: { [key: string]: number } = {};
        const details: string[] = [];
        const rawContent: string[] = [];
        
        answers.forEach(answer => {
          const cleanedAnswer = answer.answer.replace(/\s+/g, " ").replace(/\s*([，。！？])\s*/g, "$1").trim();
          rawContent.push(cleanedAnswer);
          
          // 提取具体细节（专有名词、特定事件、地点、感受等）
          const extractedDetails = cleanedAnswer.match(/[\u4e00-\u9fa5]{2,4}(?:[，。！？]|$)|[A-Za-z0-9_\-]+|"[^"]+"|'[^']+'/g) || [];
          details.push(...extractedDetails.filter(d => d.trim().length > 2));
          
          // 识别主题关键词，增强抽象概念识别
          const themeKeywords = [
            { pattern: /(前往|漫步|旅行|探索|实习|工作|迁移|驻扎)/g, theme: "行程与经历" },
            { pattern: /(感受|情感|成长|变化|思考|反思|领悟|蜕变)/g, theme: "内心与成长" },
            { pattern: /(喜欢|钟爱|品尝|聆听|阅读|观赏|沉浸|享受)/g, theme: "品味与喜好" },
            { pattern: /(目标|希望|梦想|计划|期待|憧憬|规划|愿景)/g, theme: "愿景与计划" },
            { pattern: /(朋友|家人|伙伴|交流|相遇|离别|联结|互动)/g, theme: "人际与关系" }
          ];
          
          themeKeywords.forEach(({ pattern, theme }) => {
            if (pattern.test(cleanedAnswer)) {
              themes[theme] = (themes[theme] || 0) + 1;
            }
          });
        });
        
        // 确定主导主题
        const dominantTheme = Object.entries(themes).sort(([,a], [,b]) => b - a)[0]?.[0] || "综合体验";
        
        return { 
          dominantTheme, 
          uniqueDetails: [...new Set(details)],
          combinedContent: rawContent.join(" ")
        };
      };
      
      // 对信息点进行抽象概括，增强系统性和更高维度的抽象
      const abstractContent = (content: string) => {
        // 抽象化替换规则：将具体事件转化为概念框架，增强系统性抽象
        const abstractionRules = [
          { pattern: /(.*?)(?:在|前往|到)([\u4e00-\u9fa5]+)(?:实习|工作|学习|生活)/g, replacement: "$1在$2的职业与生活系统性探索" },
          { pattern: /喜欢(?:听|看|读|欣赏)([\u4e00-\u9fa5\w]+)/g, replacement: "对$1的深度品味与系统性欣赏" },
          { pattern: /(目标|希望|梦想|计划)是(.*?)(?:，|。|$)/g, replacement: "怀揣着$2的系统性$1框架" },
          { pattern: /(经历|遇到|感受)了(.*?)(?:，|。|$)/g, replacement: "亲历$2的系统化成长体验" },
          { pattern: /获得了(.*?)(?:成就|进步|成长)/g, replacement: "实现了$1的系统性自我提升" },
          { pattern: /(.*?)[，。！？]*(?:发现|感受到|意识到)(.*?)(?:，|。|$)/g, replacement: "$1在探索中系统领悟到$2的深刻内涵" },
          { pattern: /(.*?)(?:做了|进行了|完成了)(.*?)(?:，|。|$)/g, replacement: "$1系统性开展了$2的实践活动" },
          { pattern: /(.*?)(?:学习了|掌握了)(.*?)(?:，|。|$)/g, replacement: "$1在$2领域实现了系统性知识构建" }
        ];
        
        let abstracted = content;
        abstractionRules.forEach(({ pattern, replacement }) => {
          abstracted = abstracted.replace(pattern, replacement);
        });
        
        return abstracted;
      };
      
      // 构建系统性叙事，增强逻辑框架和抽象概括
      const buildSystematicNarrative = (answers: any[]) => {
        const { dominantTheme, uniqueDetails, combinedContent } = analyzeAnswers(answers);
        
        // 从整体内容中提取核心思想，而非孤立句子
        const coreIdeas = [];
        
        // 1. 识别核心行动与事件
        const actionPatterns = /(?:进行|开展|完成|经历|实现|获得|学习|掌握|探索)([\u4e00-\u9fa5\w\s]+?)(?:，|。|$)/g;
        let actionMatch;
        while ((actionMatch = actionPatterns.exec(combinedContent)) !== null) {
          coreIdeas.push(actionMatch[0].trim());
        }
        
        // 2. 识别核心感受与领悟
        const feelingPatterns = /(?:感受到|意识到|领悟到|认识到|体会到)([\u4e00-\u9fa5\w\s]+?)(?:，|。|$)/g;
        let feelingMatch;
        while ((feelingMatch = feelingPatterns.exec(combinedContent)) !== null) {
          coreIdeas.push(feelingMatch[0].trim());
        }
        
        // 3. 识别核心目标与愿景
        const goalPatterns = /(?:希望|梦想|计划|期待|憧憬)(?:成为|实现|达到|拥有)([\u4e00-\u9fa5\w\s]+?)(?:，|。|$)/g;
        let goalMatch;
        while ((goalMatch = goalPatterns.exec(combinedContent)) !== null) {
          coreIdeas.push(goalMatch[0].trim());
        }
        
        // 4. 如果核心思想不足，从每个回答中提取
        if (coreIdeas.length === 0) {
          coreIdeas.push(...answers.map(answer => {
            const cleaned = answer.answer.replace(/\s+/g, " ").trim();
            // 提取句子主干，避免直接复制
            if (cleaned.length > 30) {
              return cleaned.match(/[\u4e00-\u9fa5]+(?:，|。)/g)?.[0] || cleaned.substring(0, 30);
            }
            return cleaned;
          }));
        }
        
        // 对核心思想进行抽象概括，确保不直接复制
        const abstractedIdeas = [...new Set(coreIdeas)].map(abstractContent);
        
        // 构建逻辑框架：引入-展开-深化-升华
        let narrative = "";
        
        // 引入：确立主导主题，增强系统性视角
        const systematicIntroductions = [
          `从系统视角看${dominantTheme}，`,
          `在${dominantTheme}的系统框架中，`,
          `透过${dominantTheme}的抽象棱镜，`,
          `从更高维度审视${dominantTheme}，`
        ];
        const introduction = systematicIntroductions[Math.floor(Math.random() * systematicIntroductions.length)];
        narrative += introduction;
        
        // 展开：整合核心思想，构建系统性叙事
        if (abstractedIdeas.length > 0) {
          if (abstractedIdeas.length === 1) {
            narrative += abstractedIdeas[0];
          } else if (abstractedIdeas.length === 2) {
            narrative += `${abstractedIdeas[0]}，同时系统性推进${abstractedIdeas[1]}`;
          } else {
            // 按逻辑分组：行动-感受-目标
            const actionIdeas = abstractedIdeas.filter(idea => /(开展|完成|经历|实现|获得|学习|掌握|探索)/.test(idea));
            const feelingIdeas = abstractedIdeas.filter(idea => /(感受|意识|领悟|认识|体会)/.test(idea));
            const goalIdeas = abstractedIdeas.filter(idea => /(希望|梦想|计划|期待|憧憬)/.test(idea));
            
            const groupedIdeas = [];
            if (actionIdeas.length > 0) groupedIdeas.push(actionIdeas.join("，"));
            if (feelingIdeas.length > 0) groupedIdeas.push(`并从中系统性领悟到${feelingIdeas.join("，")}`);
            if (goalIdeas.length > 0) groupedIdeas.push(`进而构建起${goalIdeas.join("，")}`);
            
            narrative += groupedIdeas.join("，") || abstractedIdeas.slice(0, 3).join("，");
          }
        }
        
        // 深化：融入独特细节，增强个性化，避免直接复制
        if (uniqueDetails.length > 0) {
          const keyDetails = uniqueDetails.slice(0, 2);
          narrative += `，其中${keyDetails.join("与")}等经历在系统框架中尤为突出`;
        }
        
        // 升华：增强抽象概括和系统性总结
        const systematicConclusions = [
          "，构建了完整的成长体系",
          "，形成了独特的生命叙事框架",
          "，在系统视角下展现出深刻价值",
          "，从抽象维度彰显出成长意义"
        ];
        const conclusion = systematicConclusions[Math.floor(Math.random() * systematicConclusions.length)];
        
        // 确保不重复添加类似表达
        if (!/(体系|框架|系统|抽象)/.test(narrative)) {
          narrative += conclusion;
        }
        
        // 应用文学化词汇替换
        narrative = applyLiteraryVocab(narrative);
        
        // 移除冗余和不流畅的表达，确保不直接复制用户回答
        narrative = narrative
          .replace(/，+/g, "，")
          .replace(/^.*?，/, "") // 移除引言前缀
          .replace(/\s+/g, " ")
          .trim();
        
        // 确保内容不包含完整的用户原句
        validAnswers.forEach(answer => {
          const original = answer.answer.trim();
          if (narrative.includes(original)) {
            // 抽象替换完整原句
            const abstracted = abstractContent(original);
            narrative = narrative.replace(original, abstracted);
          }
        });
        
        return narrative;
      };
      
      return buildSystematicNarrative(validAnswers);
    };
    
    // 根据新的prompt要求，创建四个专门的卡片生成器
    const generateCard1 = (answers: any[]) => {
      const validAnswers = answers.filter(a => a.answer !== "Skipped" && a.answer.trim().length > 0);
      if (validAnswers.length === 0) return { title: "向北启程", content: "这一年，你在时光的河流中静静探索。那些未被记录的尝试与相遇，都化作温暖的养分，在未来的日子里悄然绽放。新的征程即将开启，愿你带着勇气与希望，继续书写属于自己的浪漫故事。", keyword: "GROWTH", style: "ticket" as const };
      
      // 提取关键信息：Q1(新尝试), Q5(地点), Q7(铭记时刻), Q8(成就), Q18(自我认识), Q29(自我认识)
      const q1Answer = validAnswers.find(a => a.question.includes("新尝试") || a.question.includes("第一次"))?.answer || "";
      const q5Answer = validAnswers.find(a => a.question.includes("城市") || a.question.includes("国家") || a.question.includes("地方"))?.answer || "";
      const q7Answer = validAnswers.find(a => a.question.includes("铭记") || a.question.includes("难忘"))?.answer || "";
      const q8Answer = validAnswers.find(a => a.question.includes("成就") || a.question.includes("骄傲"))?.answer || "";
      const q18Answer = validAnswers.find(a => a.question.includes("自我认识") || a.question.includes("改变"))?.answer || "";
      const q29Answer = validAnswers.find(a => a.question.includes("自我") || a.question.includes("成长"))?.answer || "";
      
      // 生成4字标题：从用户的新尝试、新地方、新突破中提炼核心关键词
      const titlePool = ["向北启程", "初试锋芒", "破茧而出", "解锁新境", "踏浪而行", "扶摇而上", "星途坦荡", "初心如磐"];
      let title = titlePool[Math.floor(Math.random() * titlePool.length)];
      
      // 根据具体内容精准调整标题
      if (q5Answer) {
        title = ["向北启程", "踏浪而行", "星途坦荡"][Math.floor(Math.random() * 3)];
      } else if (q8Answer) {
        title = ["初试锋芒", "破茧而出", "扶摇而上"][Math.floor(Math.random() * 3)];
      } else if (q1Answer) {
        title = ["解锁新境", "初试锋芒", "破茧而出"][Math.floor(Math.random() * 3)];
      } else if (q18Answer || q29Answer) {
        title = ["向内生长", "初心如磐", "解锁新境"][Math.floor(Math.random() * 3)];
      }
      
      // 生成正文：2-3个自然段，总字数120-150字，用第二人称"你"，语气温暖真诚
      let paragraphs: string[] = [];
      
      // 第一段：新尝试和新地方
      let firstParagraph = "";
      if (q1Answer && q5Answer) {
        firstParagraph = `这一年，你勇敢尝试了${q1Answer.replace(/[，。！？]$/, "")}，温暖的足迹也抵达了${q5Answer.replace(/[，。！？]$/, "")}。那些未知的风景与新鲜的体验，如同春天的嫩芽，在你的生命里悄然生长。`;
      } else if (q1Answer) {
        firstParagraph = `这一年，你温柔地推开了新世界的门，尝试了${q1Answer.replace(/[，。！？]$/, "")}。每一次突破舒适区的脚步，都在你的成长地图上留下了温暖的印记。`;
      } else if (q5Answer) {
        firstParagraph = `这一年，你带着好奇心走过了${q5Answer.replace(/[，。！？]$/, "")}。不同的风土人情如同温暖的阳光，轻轻洒在你的心上，丰富了你对世界的认知。`;
      } else {
        firstParagraph = `这一年，你在生活的画布上用心涂抹，每一笔都承载着对未知的温柔探索与真诚期待。`;
      }
      paragraphs.push(firstParagraph);
      
      // 第二段：成就和自我认识
      let secondParagraph = "";
      if (q8Answer && (q18Answer || q29Answer)) {
        const selfDiscovery = q18Answer || q29Answer;
        secondParagraph = `你用努力书写了${q8Answer.replace(/[，。！？]$/, "")}的骄傲，也在时光的温暖沉淀中重新认识了自己：${selfDiscovery.replace(/[，。！？]$/, "")}。这些成长的瞬间，如同星星点点的光，照亮了你未来的道路。`;
      } else if (q8Answer) {
        secondParagraph = `你用汗水与坚持，收获了${q8Answer.replace(/[，。！？]$/, "")}的成就。这份温暖的肯定，不仅是对过去的奖励，更是未来继续前行的动力源泉。`;
      } else if (q18Answer || q29Answer) {
        const selfDiscovery = q18Answer || q29Answer;
        secondParagraph = `在时光的温柔流淌中，你对自己有了新的认识：${selfDiscovery.replace(/[，。！？]$/, "")}。这种向内的真诚探索，滋养着你生命的每一寸成长。`;
      } else {
        secondParagraph = `那些看似平凡的日子里，藏着你最真实的成长。每一次温暖的思考与感悟，都在悄悄塑造着更美好的自己。`;
      }
      paragraphs.push(secondParagraph);
      
      // 第三段（可选）：铭记时刻
      let thirdParagraph = "";
      if (q7Answer && paragraphs.join("").length < 120) {
        thirdParagraph = `特别是${q7Answer.replace(/[，。！？]$/, "")}的那一刻，如同温暖的阳光，永远铭刻在你的记忆深处，成为生命中最珍贵的礼物。`;
        paragraphs.push(thirdParagraph);
      }
      
      // 确保结尾传递向上的力量
      let content = paragraphs.join("\n\n");
      if (!/(未来|希望|勇气|力量|继续前行)/i.test(content)) {
        const closingLines = ["未来的道路上，愿你带着这份温暖的成长力量，继续勇敢前行。", "新的旅程即将开启，愿你保持真诚与热爱，奔赴下一场浪漫的山海。", "所有温暖的经历都将化作光，照亮你未来的每一步路。"];
        content += "\n\n" + closingLines[Math.floor(Math.random() * closingLines.length)];
      }
      
      // 调整内容长度
      if (content.length > 150) {
        content = content.slice(0, 150).replace(/[，。！？]$/, "") + "。";
      } else if (content.length < 120) {
        const expansions = ["每一个温暖的脚印都算数，每一次真诚的尝试都有意义。", "成长的道路或许曲折，但你从未停止温暖前行的脚步。", "那些看似微小的改变，终将汇聚成生命中最浪漫的江河。"];
        const expansion = expansions.find(e => content.length + e.length <= 150) || expansions[0];
        content += "\n\n" + expansion;
      }
      
      return {
        title,
        content,
        keyword: "GROWTH",
        style: "ticket" as const
      };
    };

    const generateCard2 = (answers: any[]) => {
      const validAnswers = answers.filter(a => a.answer !== "Skipped" && a.answer.trim().length > 0);
      if (validAnswers.length === 0) return { title: "心有所依", content: "这一年，你的心始终被温柔包围着。那些未曾说出口的牵挂，那些默默陪伴的时光，都化作生命中最柔软的力量，在岁月里静静流淌，温暖着每一个晨昏。", keyword: "EMOTIONS", style: "paper" as const };
      
      // 提取关键信息：Q3(重要变化), Q4(最大改变), Q13(感谢的人), Q22(爱), Q37(思念的人), Q38(联系频率)
      const q3Answer = validAnswers.find(a => a.question.includes("重要的人际关系变化") || a.question.includes("关系变化"))?.answer || "";
      const q4Answer = validAnswers.find(a => a.question.includes("最大的改变") || a.question.includes("最大改变"))?.answer || "";
      const q13Answer = validAnswers.find(a => a.question.includes("感谢") || a.question.includes("表扬"))?.answer || "";
      const q22Answer = validAnswers.find(a => a.question.includes("爱") || a.question.includes("恋爱"))?.answer || "";
      const q37Answer = validAnswers.find(a => a.question.includes("思念") || a.question.includes("想念"))?.answer || "";
      const q38Answer = validAnswers.find(a => a.question.includes("联系频率") || a.question.includes("多久联系"))?.answer || "";
      
      // 生成4字标题，参考风格：「心有所依」「温柔相遇」「双向奔赴」「并肩同行」
      const titlePool = ["心有所依", "温柔相遇", "双向奔赴", "并肩同行", "温暖相伴", "思念如星", "感恩遇见", "情系于心"];
      let title = titlePool[Math.floor(Math.random() * titlePool.length)];
      
      // 根据具体内容调整标题
      if (q37Answer) {
        title = ["思念如星", "情系于心", "心有所依"][Math.floor(Math.random() * 3)];
      } else if (q13Answer) {
        title = ["感恩遇见", "温暖相伴", "温柔相遇"][Math.floor(Math.random() * 3)];
      } else if (q22Answer?.includes("爱")) {
        title = ["双向奔赴", "并肩同行", "温柔相遇"][Math.floor(Math.random() * 3)];
      }
      
      // 生成正文：2段，总字数100-130字，用第二人称"你"，语气温柔细腻
      let paragraphs: string[] = [];
      
      // 第一段：人际关系变化和感谢
      let firstParagraph = "";
      if (q13Answer && q3Answer) {
        firstParagraph = `这一年，你的人际关系如同春江水暖，有了${q3Answer.replace(/[，。！？]$/, "")}的温柔变化。而最让你心尖发烫的，是${q13Answer.replace(/[，。！？]$/, "")}的那份温暖。这份心意，如同春日里的第一缕阳光，轻轻洒在你的心房。`;
      } else if (q13Answer) {
        firstParagraph = `这一年，你最想感谢的是${q13Answer.replace(/[，。！？]$/, "")}。那些被温柔以待的时刻，那些默默支持的力量，都成为你生命中最珍贵的星光。`;
      } else if (q3Answer) {
        firstParagraph = `这一年，你的人际关系经历了${q3Answer.replace(/[，。！？]$/, "")}的流转。那些温柔的相遇与体面的告别，都让你更加懂得珍惜眼前的温暖。`;
      } else if (q22Answer?.includes("爱")) {
        firstParagraph = `这一年，爱如同春风般掠过你的生命。${q22Answer.replace(/[，。！？]$/, "")}的时光，如同细水长流，在你的心田里缓缓流淌。`;
      } else {
        firstParagraph = `这一年，你的内心始终被温柔包围着。那些看似平凡的陪伴，那些未曾言说的默契，都在悄然间治愈着你的心灵。`;
      }
      paragraphs.push(firstParagraph);
      
      // 第二段：思念与连接
      let secondParagraph = "";
      if (q37Answer) {
        secondParagraph = `每当想起${q37Answer.replace(/[，。！？]$/, "")}，你的心中总会涌起一丝温柔的思念。那些相隔千里的牵挂，如同月光下的湖水，波光粼粼，让你明白：爱从未走远，只是换了一种方式陪伴。`;
      } else if (q38Answer) {
        secondParagraph = `你与重要的人保持着${q38Answer.replace(/[，。！？]$/, "")}的联系频率。这种看似平淡的坚持，如同细水长流，恰恰是感情最长久的模样。`;
      } else if (q4Answer && (q4Answer.includes("关系") || q4Answer.includes("改变"))) {
        secondParagraph = `这一年你最大的改变，是学会了在人际关系中更加温柔以待。这种成长，如同春风拂面，让你的世界充满了温暖与善意。`;
      } else {
        secondParagraph = `那些未曾说出口的感谢，那些默默珍藏的回忆，都在时光里酿成了最甜美的酒。愿这份温柔，永远伴随你左右。`;
      }
      paragraphs.push(secondParagraph);
      
      // 调整内容长度
      let content = paragraphs.join("\n\n");
      if (content.length > 130) {
        content = content.slice(0, 130).replace(/[，。！？]$/, "") + "。";
      } else if (content.length < 100) {
        const expansions = ["那些被爱包围的日子，是你最珍贵的温暖财富。", "愿这份温柔，成为你永远的力量源泉。", "在爱与被爱中，你学会了更好地拥抱自己。"];
        const expansion = expansions.find(e => content.length + e.length <= 130) || expansions[0];
        content += "\n\n" + expansion;
      }
      
      return {
        title,
        content,
        keyword: "EMOTIONS",
        style: "paper" as const
      };
    };

    const generateCard3 = (answers: any[]) => {
      const validAnswers = answers.filter(a => a.answer !== "Skipped" && a.answer.trim().length > 0);
      if (validAnswers.length === 0) return { title: "烟火人间", content: "这一年，你在烟火日常里酿出生活的诗意。那些关于美食、音乐与书的小确幸，如同星子般点亮你的晨昏，让每一个平凡的日子都泛着温暖的光。", keyword: "TASTES", style: "note" as const };
      
      // 提取关键信息：Q12(好物), Q15(消费), Q21(生活方式), Q24(书), Q25(电影), Q26(音乐), Q27(美食), Q28(城市), Q31(生日), Q33(风格)
      const q12Answer = validAnswers.find(a => a.question.includes("好物") || a.question.includes("买过"))?.answer || "";
      const q15Answer = validAnswers.find(a => a.question.includes("花钱") || a.question.includes("消费"))?.answer || "";
      const q21Answer = validAnswers.find(a => a.question.includes("生活方式") || a.question.includes("生活方式选择"))?.answer || "";
      const q24Answer = validAnswers.find(a => a.question.includes("书") || a.question.includes("阅读"))?.answer || "";
      const q25Answer = validAnswers.find(a => a.question.includes("电影") || a.question.includes("看的电影"))?.answer || "";
      const q26Answer = validAnswers.find(a => a.question.includes("音乐") || a.question.includes("年度之歌"))?.answer || "";
      const q27Answer = validAnswers.find(a => a.question.includes("美食") || a.question.includes("吃的") || a.question.includes("味觉"))?.answer || "";
      const q31Answer = validAnswers.find(a => a.question.includes("生日") || a.question.includes("怎么庆祝"))?.answer || "";
      const q33Answer = validAnswers.find(a => a.question.includes("个人风格") || a.question.includes("风格") || a.question.includes("审美"))?.answer || "";
      
      // 生成4字标题，参考风格：「烟火人间」「诗酒年华」「况味日常」「简素欢喜」
      const titlePool = ["烟火人间", "诗酒年华", "况味日常", "简素欢喜", "人间烟火", "食色生香", "雅俗共赏", "岁月静好"];
      let title = titlePool[Math.floor(Math.random() * titlePool.length)];
      
      // 根据具体内容调整标题
      if (q27Answer) {
        title = ["烟火人间", "食色生香", "人间烟火"][Math.floor(Math.random() * 3)];
      } else if (q24Answer || q26Answer) {
        title = ["诗酒年华", "雅俗共赏", "简素欢喜"][Math.floor(Math.random() * 3)];
      } else if (q33Answer) {
        title = ["简素欢喜", "况味日常", "岁月静好"][Math.floor(Math.random() * 3)];
      }
      
      // 生成正文：2-3段，总字数110-140字，用第二人称"你"，语气优雅有趣，用词浪漫温馨
      let paragraphs: string[] = [];
      
      // 第一段：文化消费和生活方式
      let firstParagraph = "";
      if ((q24Answer || q25Answer || q26Answer) && q21Answer) {
        const culturalConsumption = [q24Answer, q25Answer, q26Answer].filter(Boolean).join("、") || "文化消费";
        firstParagraph = `这一年，你选择了${q21Answer.replace(/[，。！？]$/, "")}的生活方式，在${culturalConsumption.replace(/[，。！？]$/, "")}中诗意地栖居。那些沉浸在艺术与美的时光，如同春风拂过心田，让你的生活泛着温柔的光。`;
      } else if (q24Answer || q25Answer || q26Answer) {
        const culturalConsumption = [q24Answer, q25Answer, q26Answer].filter(Boolean).join("、") || "文化消费";
        firstParagraph = `这一年，你在${culturalConsumption.replace(/[，。！？]$/, "")}中找到了心灵的桃花源。那些与文字、旋律、光影相遇的时刻，如同清泉般滋养着你的精神世界。`;
      } else if (q21Answer) {
        firstParagraph = `这一年，你选择了${q21Answer.replace(/[，。！？]$/, "")}的生活方式。这种不疾不徐的优雅姿态，让你在喧嚣的世界中守着一方宁静的天地。`;
      } else {
        firstParagraph = `这一年，你在烟火日常里用心书写着生活的诗行。那些看似琐碎的点滴，因为你的热爱与专注，都绽放出独特的美好。`;
      }
      paragraphs.push(firstParagraph);
      
      // 第二段：美食和个人风格
      let secondParagraph = "";
      if (q27Answer && q33Answer) {
        secondParagraph = `你对${q27Answer.replace(/[，。！？]$/, "")}的热爱，正如你${q33Answer.replace(/[，。！？]$/, "")}的个人风格一般，鲜活而热烈。这种对生活美学的执着追求，让你的每一天都交织着诱人的色彩与芬芳的味道。`;
      } else if (q27Answer) {
        secondParagraph = `你对${q27Answer.replace(/[，。！？]$/, "")}的热爱，是生活最甜美的注脚。那些舌尖上绽放的惊喜，如同春天的花火，永远鲜活在你的记忆深处。`;
      } else if (q33Answer) {
        secondParagraph = `你的${q33Answer.replace(/[，。！？]$/, "")}个人风格，是生活最优雅的名片。这种对美的坚持，让你在人群中如同一株静静绽放的幽兰，散发着独特的魅力。`;
      } else if (q12Answer || q15Answer) {
        const consumption = [q12Answer, q15Answer].filter(Boolean).join("、") || "消费选择";
        secondParagraph = `你的${consumption.replace(/[，。！？]$/, "")}，处处彰显着对生活美学的独到见解。这些看似微小的选择，串起了你独特的生活哲学。`;
      } else {
        secondParagraph = `那些生活中的小确幸，如同散落的星光，温柔地照亮你的每一个晨昏。你用诗意的眼光，将平凡日子过成了别人羡慕的风景。`;
      }
      paragraphs.push(secondParagraph);
      
      // 第三段（可选）：生日庆祝
      let thirdParagraph = "";
      if (q31Answer && paragraphs.join("").length < 100) {
        thirdParagraph = `特别是${q31Answer.replace(/[，。！？]$/, "")}的生日庆祝，如同一场温馨的梦，成为这一年最珍贵的美好印记。`;
        paragraphs.push(thirdParagraph);
      }
      
      // 调整内容长度
      let content = paragraphs.join("\n\n");
      if (content.length > 140) {
        content = content.slice(0, 140).replace(/[，。！？]$/, "") + "。";
      } else if (content.length < 110) {
        const expansions = ["生活的美学，正藏在这些温柔的烟火细节里。", "你用热爱与诗意，把平凡日子酿成了甜美的酒。", "这些关于美的体验，将是你一生珍贵的精神宝藏。"];
        const expansion = expansions.find(e => content.length + e.length <= 140) || expansions[0];
        content += "\n\n" + expansion;
      }
      
      return {
        title,
        content,
        keyword: "TASTES",
        style: "note" as const
      };
    };

    const generateCard4 = (answers: any[]) => {
      const validAnswers = answers.filter(a => a.answer !== "Skipped" && a.answer.trim().length > 0);
      if (validAnswers.length === 0) return { title: "笃定前行", content: "新的一年即将到来，你带着满满的期待与勇气，准备迎接新的挑战。那些未实现的愿望，那些想要改变的地方，都将成为你前进的动力。愿你在新的旅程中，保持初心，笃定前行。", keyword: "FUTURE", style: "polaroid" as const };
      
      // 提取关键信息：Q6(明年想要), Q19(做更多), Q20(做更少), Q30(没得到的), Q32(未发生的事), Q34(力量来源), Q40(一句话总结)
      const q6Answer = validAnswers.find(a => a.question.includes("明年") || a.question.includes("想要"))?.answer || "";
      const q19Answer = validAnswers.find(a => a.question.includes("更多") || a.question.includes("增加"))?.answer || "";
      const q20Answer = validAnswers.find(a => a.question.includes("更少") || a.question.includes("减少"))?.answer || "";
      const q30Answer = validAnswers.find(a => a.question.includes("没得到") || a.question.includes("遗憾") || a.question.includes("未实现"))?.answer || "";
      const q32Answer = validAnswers.find(a => a.question.includes("未发生的事") || a.question.includes("希望发生"))?.answer || "";
      const q34Answer = validAnswers.find(a => a.question.includes("力量来源") || a.question.includes("保持理智"))?.answer || "";
      const q40Answer = validAnswers.find(a => a.question.includes("一句话") || a.question.includes("总结"))?.answer || "";
      
      // 生成4字标题，参考风格：「笃定前行」「更远征途」「无畏向前」「坚定如初」
      const titlePool = ["笃定前行", "更远征途", "无畏向前", "坚定如初", "心向远方", "逐梦未来", "破茧成蝶", "重启征程"];
      let title = titlePool[Math.floor(Math.random() * titlePool.length)];
      
      // 根据具体内容调整标题
      if (q6Answer || q32Answer) {
        title = ["心向远方", "逐梦未来", "笃定前行"][Math.floor(Math.random() * 3)];
      } else if (q30Answer) {
        title = ["破茧成蝶", "重启征程", "无畏向前"][Math.floor(Math.random() * 3)];
      } else if (q19Answer || q20Answer) {
        title = ["坚定如初", "更远征途", "笃定前行"][Math.floor(Math.random() * 3)];
      }
      
      // 生成正文：3-4段，总字数140-180字，用第二人称"你"，语气坚定温暖
      let paragraphs: string[] = [];
      
      // 第一段：对明年的期待
      let firstParagraph = "";
      if (q6Answer) {
        firstParagraph = `新的一年，你最期待的是${q6Answer.replace(/[，。！？]$/, "")}。这份期待如同明亮的灯塔，为你照亮前进的方向。`;
      } else if (q32Answer) {
        firstParagraph = `你一直期待着${q32Answer.replace(/[，。！？]$/, "")}的发生。新的一年，愿这份期待能成为现实。`;
      } else {
        firstParagraph = `新的一年即将到来，你带着满满的期待，准备迎接属于自己的精彩。`;
      }
      paragraphs.push(firstParagraph);
      
      // 第二段：想要改变的地方
      let secondParagraph = "";
      if (q19Answer && q20Answer) {
        secondParagraph = `在新的一年里，你希望能多做${q19Answer.replace(/[，。！？]$/, "")}，同时减少${q20Answer.replace(/[，。！？]$/, "")}。这种有进有退的智慧，将帮助你更好地平衡生活与梦想。`;
      } else if (q19Answer) {
        secondParagraph = `你希望在新的一年里能多做${q19Answer.replace(/[，。！？]$/, "")}。这种积极向上的态度，将为你的生活注入新的活力。`;
      } else if (q20Answer) {
        secondParagraph = `你决心在新的一年里减少${q20Answer.replace(/[，。！？]$/, "")}。学会取舍，才能更好地专注于真正重要的事情。`;
      } else {
        secondParagraph = `你渴望在新的一年里有所改变，这种改变不是为了迎合他人，而是为了成为更好的自己。`;
      }
      paragraphs.push(secondParagraph);
      
      // 第三段：未实现的愿望
      let thirdParagraph = "";
      if (q30Answer) {
        thirdParagraph = `虽然今年有些${q30Answer.replace(/[，。！？]$/, "")}的遗憾，但这并不会阻挡你前进的脚步。新的一年，这些未实现的愿望将成为你奋斗的动力。`;
      } else {
        thirdParagraph = `回顾过去的一年，你或许有过迷茫与困惑，但这些经历都将成为你未来道路上最宝贵的财富。`;
      }
      paragraphs.push(thirdParagraph);
      
      // 第四段：力量来源和结尾锚点
      let fourthParagraph = "";
      if (q34Answer) {
        fourthParagraph = `你的力量来自于${q34Answer.replace(/[，。！？]$/, "")}。正是这份力量，让你在面对困难时始终保持坚定与勇气。新的一年，愿这份力量继续陪伴着你，勇敢前行。`;
      } else if (q40Answer) {
        fourthParagraph = `${q40Answer.replace(/[，。！？]$/, "")}。这是你对过去一年的总结，也是你对未来的承诺。新的一年，愿你带着这份信念，继续书写属于自己的精彩。`;
      } else {
        fourthParagraph = `无论前方的道路如何曲折，你都将保持初心，坚定前行。新的一年，愿你能收获更多的成长与幸福。`;
      }
      paragraphs.push(fourthParagraph);
      
      // 调整内容长度
      let content = paragraphs.join("\n\n");
      if (content.length > 180) {
        content = content.slice(0, 180).replace(/[，。！？]$/, "") + "。";
      } else if (content.length < 140) {
        const expansions = ["每一个新的开始，都是一次重新认识自己的机会。", "愿你在新的一年里，能够勇敢地追逐自己的梦想。", "那些流过的汗水与泪水，都将成为你未来成功的见证。"];
        const expansion = expansions.find(e => content.length + e.length <= 180) || expansions[0];
        content += "\n\n" + expansion;
      }
      
      return {
        title,
        content,
        keyword: "FUTURE",
        style: "polaroid" as const
      };
    };

    // 生成新的卡片
    const card1 = generateCard1(categorizedAnswers.journey);
    const card2 = generateCard2(categorizedAnswers.emotions);
    const card3 = generateCard3(categorizedAnswers.tastes);
    const card4 = generateCard4(categorizedAnswers.future);
    
    // 修辞手法应用函数：比喻
    const applyMetaphor = (text: string, theme: string) => {
      const metaphors: { [key: string]: string[] } = {
        journey: [
          "如同一首悠扬的诗", "宛如一幅生动的画卷", "恰似一场梦幻的旅行",
          "如同一条蜿蜒的河流", "宛如一颗璀璨的明星", "恰似一朵绽放的花朵"
        ],
        emotions: [
          "如同一首动人的歌", "宛如一颗明亮的星星", "恰似一缕温暖的阳光",
          "如同一片宁静的湖水", "宛如一朵娇艳的花朵", "恰似一阵轻柔的微风"
        ],
        tastes: [
          "如同一杯甘醇的美酒", "宛如一首动人的旋律", "恰似一场味觉的盛宴",
          "如同一片绚烂的彩虹", "宛如一朵芬芳的花朵", "恰似一阵清新的微风"
        ],
        future: [
          "如同一座高耸的山峰", "宛如一片广阔的海洋", "恰似一颗明亮的灯塔",
          "如同一片璀璨的星空", "宛如一朵绽放的花朵", "恰似一阵清新的微风"
        ]
      };
      
      if (Math.random() > 0.7 && text.length < 120) {
        const selectedMetaphor = metaphors[theme][Math.floor(Math.random() * metaphors[theme].length)];
        return `${text}，${selectedMetaphor}。`;
      }
      return text;
    };
    
    // 修辞手法应用函数：拟人
    const applyPersonification = (text: string, theme: string) => {
      const personifications: { [key: string]: string[] } = {
        journey: [
          "时光轻抚着你的脸庞", "岁月在耳边低语", "道路向你敞开怀抱",
          "风景在眼前翩翩起舞", "微风为你歌唱", "阳光为你指路"
        ],
        emotions: [
          "心灵在欢快地跳跃", "回忆在脑海中低语", "情感在心中流淌",
          "思绪在风中飞舞", "感动在心中绽放", "惆怅在指尖缠绕"
        ],
        tastes: [
          "美食在舌尖上跳舞", "香气在空气中漫步", "味道在口中绽放",
          "味蕾在欢快地歌唱", "美味在心中流淌", "滋味在记忆中沉睡"
        ],
        future: [
          "希望在向你招手", "梦想在心中燃烧", "未来在眼前展开",
          "机遇在身边徘徊", "成功在向你微笑", "信念在心中坚守"
        ]
      };
      
      if (Math.random() > 0.7 && text.length < 120) {
        const selectedPersonification = personifications[theme][Math.floor(Math.random() * personifications[theme].length)];
        return `${text}，${selectedPersonification}。`;
      }
      return text;
    };
    
    // 修辞手法应用函数：排比
    const applyParallelism = (text: string, theme: string) => {
      const parallelisms: { [key: string]: string[] } = {
        journey: [
          "在风雨中前行，在阳光下成长，在岁月中蜕变",
          "走过山川，看过河流，遇见过往，期待未来",
          "用脚步丈量世界，用心灵感受生活，用热情拥抱未来"
        ],
        emotions: [
          "有欢笑，有泪水，有感动，有成长",
          "经历过挫折，品尝过成功，感受过温暖，体验过成长",
          "在迷茫中寻找方向，在困境中坚守信念，在成功中保持谦逊"
        ],
        tastes: [
          "品尝过美食的香气，感受过饮品的甘醇，体验过生活的美好",
          "在烟火气中寻找诗意，在平凡中发现美好，在简单中品味幸福",
          "有酸甜苦辣的滋味，有喜怒哀乐的情感，有丰富多彩的生活"
        ],
        future: [
          "有梦想，有希望，有信念，有力量",
          "朝着目标前进，怀着梦想飞翔，带着希望远航",
          "对未来充满期待，对生活充满热情，对自己充满信心"
        ]
      };
      
      if (Math.random() > 0.8 && text.length < 110) {
        const selectedParallelism = parallelisms[theme][Math.floor(Math.random() * parallelisms[theme].length)];
        return `${text}，${selectedParallelism}。`;
      }
      return text;
    };
    
    // 创建更具文学性的fallback卡片内容，确保长度在100-150个中文字符
    const createLiteraryContent = (baseContent: string, theme: string) => {
      // 系统抽象型短语库：增强内容的系统性总结和更高维度抽象
      const systematicPhrases: { [key: string]: string[] } = {
        journey: [
          "在生命的坐标系中勾勒出独特的轨迹，每一步都蕴含着成长的密码，这些跨时空的探索构成了你人生的独特叙事框架。",
          "将零散的经历编织成有机整体，从地理位移中提炼出生命的律动，形成了一幅跨越地域与时间的成长画卷。",
          "在时空的流转中构建了个人成长的逻辑体系，那些看似孤立的足迹串联成生命的主轴线，彰显着探索的系统性价值。",
          "从具体的行程中抽象出人生的探索模式，将物理空间的移动升华为精神层面的拓展，形成了独特的成长方法论。",
          "将碎片化的经历整合为系统性的生命叙事，在地理与心理的双重维度上构建了个人成长的完整图景。"
        ],
        emotions: [
          "从情绪的波动中提炼出内心成长的规律，将感性体验升华为理性认知，形成了独特的情感成长体系。",
          "将零散的心理体验整合成系统性的心灵地图，从情感的起伏中识别出成长的轨迹，构建了内心世界的完整框架。",
          "在情感的光谱中发现了成长的密码，将具体的情绪体验抽象为普遍的心理规律，形成了独特的成长哲学。",
          "从情感的潮汐中提炼出生命的韵律，将个体的情绪体验升华为集体的成长智慧，构建了系统性的内心成长模型。",
          "将碎片化的情感体验整合成有机的心灵叙事，在情绪与认知的互动中构建了个人成长的完整体系。"
        ],
        tastes: [
          "从感官的愉悦中提炼出生活的美学原则，将具体的品味体验升华为普遍的生活智慧，形成了独特的审美体系。",
          "将零散的感官体验整合成系统性的生活美学，从具体的喜好中识别出价值取向，构建了生活品味的完整框架。",
          "在味蕾的绽放中发现了生活的哲学，将个体的味觉体验升华为普遍的生活智慧，形成了独特的生活美学。",
          "从具体的品味中抽象出生活的本质，将零散的感官愉悦整合成有机的生活叙事，构建了系统性的生活美学体系。",
          "将碎片化的感官体验整合成系统性的生活智慧，在审美与生活的互动中构建了个人品味的完整框架。"
        ],
        future: [
          "从具体的愿望中提炼出人生的发展战略，将零散的憧憬整合成系统性的未来规划，形成了独特的成长路径。",
          "将碎片化的未来期许整合成有机的人生蓝图，从具体的目标中识别出核心价值，构建了系统性的未来发展框架。",
          "在对未来的想象中构建了人生的发展体系，将个体的憧憬升华为普遍的成长智慧，形成了独特的未来哲学。",
          "从具体的目标中抽象出人生的发展规律，将零散的期许整合成系统性的未来叙事，构建了完整的成长路径。",
          "将碎片化的未来愿景整合成有机的人生战略，在理想与现实的互动中构建了系统性的未来发展框架。"
        ]
      };
      
      // 扩展的文学短语库，增加更多多样化的选择
      const literaryPhrases: { [key: string]: string[] } = {
        journey: [
          "在岁月的画布上，你用脚步丈量世界的宽度，每一个脚印都如诗如画，编织成属于你的独特风景。",
          "时光的河流缓缓流淌，你沿着河岸漫步，捡拾着旅途中的星光，每一段路程都镌刻着成长的印记。",
          "你在时光的卷轴上书写着自己的故事，那些走过的路、看过的风景，都化作了生命中最动人的诗行。",
          "四季流转间，你踏遍山河，将每一处风景都藏进心底，让生命在行走中绽放出绚丽的色彩。",
          "岁月如同一本打开的书，你用足迹在每一页上写下属于自己的故事，那些邂逅的风景都成了最美的插图。",
          "时光的风轻轻吹过，带走了旅途中的疲惫，却留下了那些动人的回忆，成为了你生命中最珍贵的财富。"
        ],
        emotions: [
          "时光如诗，你在情绪的海洋里扬帆起航，那些欢笑与泪水，终将化为照亮前行道路的星光。",
          "心灵的花园在岁月中悄然绽放，那些曾经的迷茫与坚守，都化作了滋养生命的雨露。",
          "你在情感的琴弦上轻轻拨动，弹奏出一曲曲动人的乐章，每一个音符都承载着成长的重量。",
          "岁月的风轻轻吹过，带走了青涩与懵懂，留下了成熟与从容，让你的内心如星空般深邃宁静。",
          "那些曾经的感动与惆怅，如同夜空中的繁星，点缀着你成长的道路，照亮了前行的方向。",
          "心灵的琴弦被岁月轻轻拨动，那些曾经的欢笑与泪水，都化作了最美的旋律，在生命中流淌。"
        ],
        tastes: [
          "生活如同一本打开的书，你在字里行间品味着酸甜苦辣，每一个细微的美好都值得被温柔铭记。",
          "味蕾的记忆是时光的印章，那些美食的香气、饮品的甘醇，都在记忆中酿成了最甜美的酒。",
          "你在生活的烟火气中寻找诗意，每一道菜、每一杯茶，都蕴含着生活的智慧与温度。",
          "时光的厨房里，你用热爱调制着生活的滋味，那些酸甜苦辣都化作了人生最美好的体验。",
          "那些美食的香气如同时光的精灵，在你的记忆中翩翩起舞，让每一个平凡的日子都充满了诗意。",
          "味蕾的记忆如同岁月的相册，那些曾经品尝过的滋味，都成了最珍贵的回忆，温暖着你的心房。"
        ],
        future: [
          "未来是一幅尚未完成的画卷，你以希望为笔，以梦想为墨，书写着属于自己的精彩篇章。",
          "远方的灯塔在黑暗中闪烁，你带着对未来的憧憬前行，每一步都充满了无限的可能。",
          "时光的列车载着梦想前行，你站在车厢里，望着窗外不断变化的风景，心中充满了对明天的期待。",
          "未来的天空广阔无垠，你展开梦想的翅膀，在属于自己的天空中自由翱翔，书写着生命的传奇。",
          "那些对未来的期许如同种子，在你的心田里生根发芽，终将长成参天大树，为你遮风挡雨。",
          "未来的道路如同铺满了星光，你带着梦想与希望前行，每一步都充满了无限的可能与惊喜。"
        ]
      };
      
      // 系统抽象型扩展短语库：增强内容的系统性和抽象性
      const systematicExpansions: { [key: string]: { [type: string]: { phrases: string[], purpose: string } } } = {
        journey: {
          systematic: {
            phrases: [
              "构建了独特的生命探索体系",
              "形成了跨时空的成长叙事框架",
              "从零散经历中提炼出系统性价值",
              "将地理位移升华为精神层面的拓展",
              "构建了完整的成长轨迹图谱",
              "形成了系统性的人生探索方法论"
            ],
            purpose: "增强系统性总结和更高维度抽象"
          },
          abstract: {
            phrases: [
              "从具体行程中抽象出成长模式",
              "将物理空间移动升华为精神探索",
              "从碎片化经历中识别出成长规律",
              "构建了跨地域的成长逻辑框架",
              "形成了独特的生命坐标系统"
            ],
            purpose: "提升内容的抽象概括能力"
          }
        },
        emotions: {
          systematic: {
            phrases: [
              "构建了完整的内心成长体系",
              "形成了系统性的情感认知框架",
              "从情绪波动中提炼出成长规律",
              "将感性体验升华为理性认知",
              "构建了系统性的心灵成长模型",
              "形成了独特的情感成长哲学"
            ],
            purpose: "增强系统性总结和更高维度抽象"
          },
          abstract: {
            phrases: [
              "从具体情绪中抽象出心理规律",
              "将个体体验升华为普遍成长智慧",
              "从情感潮汐中识别出生命韵律",
              "构建了完整的心灵地图",
              "形成了独特的内心成长逻辑"
            ],
            purpose: "提升内容的抽象概括能力"
          }
        },
        tastes: {
          systematic: {
            phrases: [
              "构建了完整的生活美学体系",
              "形成了系统性的审美价值框架",
              "从感官愉悦中提炼出生活智慧",
              "将具体品味升华为普遍生活原则",
              "构建了系统性的生活品味模型",
              "形成了独特的生活美学哲学"
            ],
            purpose: "增强系统性总结和更高维度抽象"
          },
          abstract: {
            phrases: [
              "从具体喜好中抽象出价值取向",
              "将个体品味升华为生活美学",
              "从感官体验中识别出生活本质",
              "构建了完整的审美坐标系统",
              "形成了独特的生活智慧逻辑"
            ],
            purpose: "提升内容的抽象概括能力"
          }
        },
        future: {
          systematic: {
            phrases: [
              "构建了完整的未来发展体系",
              "形成了系统性的人生战略框架",
              "从具体目标中提炼出成长路径",
              "将零散期许升华为系统规划",
              "构建了系统性的未来愿景模型",
              "形成了独特的人生发展哲学"
            ],
            purpose: "增强系统性总结和更高维度抽象"
          },
          abstract: {
            phrases: [
              "从具体愿望中抽象出人生战略",
              "将个体憧憬升华为成长蓝图",
              "从目标设定中识别出价值核心",
              "构建了完整的未来坐标系统",
              "形成了独特的人生发展逻辑"
            ],
            purpose: "提升内容的抽象概括能力"
          }
        }
      };
      
      // 传统扩展短语库，用于补充具体细节
      const expansionPhrases: { [key: string]: { [type: string]: { phrases: string[], purpose: string } } } = {
        journey: {
          scenic: {
            phrases: [
              "那些独特的风景和难忘的相遇", 
              "每一次驻足都如同一首动人的诗",
              "那些走过的路都成了生命中最美的风景",
              "每一处风景都藏着一段动人的故事"
            ],
            purpose: "增强场景描写，丰富视觉细节"
          },
          time: {
            phrases: [
              "在时间的长廊里留下了永恒的足迹", 
              "时光将这些瞬间酿成了最甜美的回忆",
              "岁月在这些足迹上镌刻着成长的印记"
            ],
            purpose: "强调时间流逝，深化历史感"
          }
        },
        emotions: {
          feeling: {
            phrases: [
              "那些真挚的情感和深刻的感悟", 
              "每一次感动都如同一缕温暖的阳光",
              "那些欢笑与泪水都成了生命中最动人的旋律"
            ],
            purpose: "强化情感表达，增强感染力"
          },
          inner: {
            phrases: [
              "在心灵的深处埋下了希望的种子", 
              "让你的生命更加丰盈而有温度",
              "这些感悟都成了心灵成长的养分"
            ],
            purpose: "探索内心世界，提升哲理深度"
          }
        },
        tastes: {
          sensory: {
            phrases: [
              "那些独特的风味和美好的回忆", 
              "每一口滋味都如同一首悠扬的歌",
              "那些美食的香气都成了时光最美好的馈赠"
            ],
            purpose: "增强感官体验，丰富细节描写"
          },
          lifestyle: {
            phrases: [
              "在生活的舞台上绽放出绚丽的光芒", 
              "成为了你人生旅途中最甜蜜的点缀",
              "这些美好都成了生活中最温暖的烟火气"
            ],
            purpose: "联系生活方式，提升生活质感"
          }
        },
        future: {
          aspiration: {
            phrases: [
              "那些美好的期许和坚定的信念", 
              "那些对未来的憧憬都成了前行的动力",
              "每一个梦想都在心中悄然发芽"
            ],
            purpose: "明确志向目标，增强行动感"
          },
          direction: {
            phrases: [
              "在时光的长河中指引着前进的方向", 
              "让你的未来充满了无限的可能",
              "这些目标都成了前进道路上的指南针"
            ],
            purpose: "强调方向感，增强信心"
          }
        }
      };
      
      // 增强的连接词和过渡短语，提升内容流畅性
      const transitionPhrases = [
        "从系统视角看", "透过抽象的棱镜", "从更高维度审视", "在系统框架中",
        "从具体到抽象", "从零散到系统", "从现象到本质", "从局部到整体",
        "时光荏苒，", "岁月流转，", "流年似水，", "韶华易逝，",
        "蓦然回首，", "繁华落尽，", "灯火阑珊，", "云卷云舒，"
      ];
      
      // 确保用户内容结尾没有句号，避免重复
      const cleanedBaseContent = baseContent.replace(/。$/, "");
      
      // 智能选择短语：优先选择系统抽象型短语，增强内容的系统性和抽象性
      const useSystematic = Math.random() > 0.3; // 70%概率使用系统抽象型短语
      const phrases = useSystematic ? systematicPhrases[theme] || [] : literaryPhrases[theme] || [];
      const selectedPhrase = phrases[Math.floor(Math.random() * phrases.length)] || "";
      
      // 将用户内容与文学性短语融合
      let content = "";
      if (cleanedBaseContent) {
        // 主题特定的系统抽象前缀库
        const themePrefixes: { [key: string]: string[] } = {
          journey: ["从系统视角看，", "透过抽象的棱镜，", "从更高维度审视，", "在系统框架中，"],
          emotions: ["从情感系统看，", "透过心灵的棱镜，", "从内心成长逻辑，", "在情感认知框架中，"],
          tastes: ["从生活美学系统看，", "透过品味的棱镜，", "从审美价值维度，", "在生活智慧框架中，"],
          future: ["从未来发展系统看，", "透过梦想的棱镜，", "从人生战略维度，", "在未来规划框架中，"]
        };
        
        // 智能前缀选择：根据内容长度和主题选择合适的前缀
        let selectedTransition = "";
        if (cleanedBaseContent.length < 50) {
          // 短内容优先选择系统抽象型前缀，增强抽象性
          const prefixes = themePrefixes[theme] || transitionPhrases;
          selectedTransition = `${prefixes[Math.floor(Math.random() * prefixes.length)]}，`;
        } else if (cleanedBaseContent.length < 80) {
          // 中等长度内容随机选择过渡短语，兼顾系统性和文学性
          selectedTransition = `${transitionPhrases[Math.floor(Math.random() * transitionPhrases.length)]}，`;
        }
        
        // 更智能的内容融合逻辑：确保系统性总结和更高维度抽象
        if (cleanedBaseContent.length > 80) {
          // 如果基础内容较长，使用系统抽象型结尾
          content = `${selectedTransition}${cleanedBaseContent}。这些零散的经历在系统框架中形成了独特的成长叙事。`;
        } else {
          // 如果基础内容较短，融合系统抽象型短语
          content = `${selectedTransition}${cleanedBaseContent}。${selectedPhrase}`;
        }
      } else {
        content = selectedPhrase;
      }
      
      // 应用修辞手法（比喻、拟人、排比）
      content = applyMetaphor(content, theme);
      content = applyPersonification(content, theme);
      content = applyParallelism(content, theme);
      
      // 短语相关性评分函数：增强系统性和抽象性评分权重
      const getPhraseRelevance = (phrase: string, baseContent: string, expansionType: any): number => {
        let score = 0;
        
        // 1. 关键词重叠评分
        const baseWords = baseContent.match(/[\u4e00-\u9fa5]{2,}/g) || [] as string[];
        const phraseWords = phrase.match(/[\u4e00-\u9fa5]{2,}/g) || [] as string[];
        const overlap = baseWords.filter(word => phraseWords.includes(word)).length;
        score += overlap * 3;
        
        // 2. 系统性和抽象性评分：优先选择具有系统抽象特征的短语
        const isSystematic = /系统|体系|框架|逻辑|抽象|规律|模式/.test(phrase);
        if (isSystematic) score += 10;
        
        // 3. 扩展类型目的匹配评分
        const purpose = expansionType.purpose || "";
        if (purpose) {
          if (purpose.includes("系统")) score += 8;
          if (purpose.includes("抽象")) score += 6;
        }
        
        return Math.max(0, score);
      };
      
      // 优化的内容扩展逻辑：优先使用系统抽象型扩展
      const usedExpansionTypes: string[] = [];
      
      while (content.length < 100) {
        // 优先使用系统抽象型扩展
        const useSystematicExpansion = Math.random() > 0.4; // 60%概率使用系统抽象型扩展
        let expansionsToUse: any = {};
        
        if (useSystematicExpansion) {
          expansionsToUse = systematicExpansions[theme] || {};
        } else {
          expansionsToUse = expansionPhrases[theme] || {};
        }
        
        // 选择未使用过的扩展类型
        const availableTypes = Object.keys(expansionsToUse).filter(type => !usedExpansionTypes.includes(type));
        if (availableTypes.length === 0) {
          // 如果当前类型库用完，切换到另一种类型库
          expansionsToUse = useSystematicExpansion ? expansionPhrases[theme] || {} : systematicExpansions[theme] || {};
          usedExpansionTypes.length = 0;
          continue;
        }
        
        // 优先选择系统性或抽象性类型
        const systematicTypes = availableTypes.filter(type => type === "systematic" || type === "abstract");
        const selectedType = systematicTypes.length > 0 
          ? systematicTypes[Math.floor(Math.random() * systematicTypes.length)]
          : availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        usedExpansionTypes.push(selectedType);
        const expansionType = expansionsToUse[selectedType] || { phrases: [] };
        const expansions = expansionType.phrases || [];
        const availableExpansions = expansions.filter(exp => !content.includes(exp));
        
        if (availableExpansions.length > 0) {
          // 使用相关性评分系统选择最合适的扩展短语
          const scoredExpansions = [...availableExpansions]
            .map(expansion => ({
              phrase: expansion,
              relevance: getPhraseRelevance(expansion, cleanedBaseContent, expansionType),
              length: expansion.length
            }));
          
          // 按相关性分数排序
          const sortedExpansions = scoredExpansions
            .sort((a, b) => b.relevance - a.relevance)
            .map(item => item.phrase);
          
          const expansion = sortedExpansions[0];
          
          // 智能选择扩展位置
          const insertionIndex = content.lastIndexOf("。");
          const hasNaturalBreak = insertionIndex !== -1 && insertionIndex > content.length * 0.6;
          
          if (hasNaturalBreak) {
            // 如果内容足够长且有自然断点，在最后一个句号前插入扩展
            const lastPeriodIndex = content.lastIndexOf("。");
            const beforeLastPeriod = content.slice(0, lastPeriodIndex);
            const afterLastPeriod = content.slice(lastPeriodIndex + 1);
            
            // 系统抽象型连接词库
            const connectorLibrary: { [key: string]: string[] } = {
              systematic: ["，从系统视角看，", "，透过抽象的棱镜，", "，在更高维度上，", "，在系统框架中，"],
              abstract: ["，从具体到抽象，", "，透过现象看本质，", "，从零散到系统，", "，从局部到整体，"],
              scenic: ["，目之所及，", "，行走之间，", "，驻足之处，"],
              feeling: ["，心潮起伏，", "，感慨万千，", "，真情流露，"]
            };
            
            const connectors = connectorLibrary[selectedType] || ["，"];
            const connector = connectors[Math.floor(Math.random() * connectors.length)];
            
            content = `${beforeLastPeriod}${connector}${expansion}。${afterLastPeriod}`;
          } else {
            // 对于较短的内容或没有自然断点的内容，在结尾添加扩展
            const endConnectors = ["，", "，从系统视角看，", "，透过抽象的棱镜，", "，在更高维度上，"];
            const endConnector = endConnectors[Math.floor(Math.random() * endConnectors.length)];
            content = `${content.replace(/[，。！？]$/, "")}${endConnector}${expansion}。`;
          }
        } else {
          // 如果没有可用扩展，使用完整模板
          if (cleanedBaseContent) {
            const fullTemplates = {
              journey: `从系统视角看，${cleanedBaseContent}。这些跨地域的探索在更高维度上构建了完整的成长轨迹，形成了独特的生命叙事框架。`,
              emotions: `透过心灵的棱镜，${cleanedBaseContent}。这些情感体验在系统框架中升华为内心成长的智慧，构建了完整的心灵地图。`,
              tastes: `从生活美学系统看，${cleanedBaseContent}。这些品味体验在抽象维度上形成了独特的生活智慧，构建了完整的审美框架。`,
              future: `从未来发展系统看，${cleanedBaseContent}。这些憧憬在更高维度上形成了系统的人生战略，构建了完整的未来规划框架。`
            };
            content = fullTemplates[theme as keyof typeof fullTemplates] || content;
            break;
          } else {
            // 如果没有用户内容，随机选择系统抽象型短语
            const sysPhrases = systematicPhrases[theme] || [];
            const sysPhrase = sysPhrases[Math.floor(Math.random() * sysPhrases.length)] || "";
            if (sysPhrase) {
              content = sysPhrase;
            }
            break;
          }
        }
        
        // 避免无限循环
        if (content.length > 150) break;
      }
      
      // 再次应用修辞手法，确保文学性
      content = applyMetaphor(content, theme);
      
      // 确保内容不超过150个字符，同时保持完整性和文学美感
      if (content.length > 150) {
        // 首先尝试在145-150字符之间寻找合适的截断位置
        let truncateIndex = -1;
        
        // 优先寻找逗号、句号等标点符号进行截断
        for (let i = Math.min(150, content.length - 1); i >= Math.max(140, 0) && truncateIndex === -1; i--) {
          const char = content.charAt(i);
          if (char === "，" || char === "。" || char === "！" || char === "？") {
            truncateIndex = i;
          }
        }
        
        if (truncateIndex === -1) {
          // 如果没有找到合适的标点符号，寻找词语边界
          for (let i = Math.min(150, content.length - 1); i >= Math.max(140, 0) && truncateIndex === -1; i--) {
            const prevChar = content.charAt(i - 1);
            const currentChar = content.charAt(i);
            const nextChar = i + 1 < content.length ? content.charAt(i + 1) : '';
            
            const isPrevChinese = /[\u4e00-\u9fa5]/.test(prevChar);
            const isCurrentChinese = /[\u4e00-\u9fa5]/.test(currentChar);
            const isNextChinese = /[\u4e00-\u9fa5]/.test(nextChar);
            
            if (isCurrentChinese && (i === content.length - 1 || !isNextChinese)) {
              truncateIndex = i;
            } else if (!isCurrentChinese && isPrevChinese) {
              truncateIndex = i - 1;
            }
          }
        }
        
        if (truncateIndex === -1) {
          truncateIndex = 150;
        }
        
        // 截断内容，不添加省略号，保持文学美感
        content = content.slice(0, truncateIndex + 1);
        
        // 确保结尾是完整的句子
        if (!content.endsWith("。") && !content.endsWith("！") && !content.endsWith("？")) {
          const lastSentenceEnd = Math.max(
            content.lastIndexOf("。"),
            content.lastIndexOf("！"),
            content.lastIndexOf("？")
          );
          if (lastSentenceEnd !== -1) {
            content = content.slice(0, lastSentenceEnd + 1);
          } else {
            content += "。";
          }
        }
      }
      
      // 确保最终长度在100-150字符之间
      if (content.length < 100) {
        // 优先使用系统抽象型扩展
        const themeExpansions = systematicExpansions[theme] || {};
        const allExpansions: string[] = [];
        
        Object.values(themeExpansions).forEach(expansions => {
          allExpansions.push(...expansions.phrases || []);
        });
        
        if (allExpansions.length > 0) {
          const finalExpansion = allExpansions[Math.floor(Math.random() * allExpansions.length)];
          if (content.includes("。")) {
            const lastPeriodIndex = content.lastIndexOf("。");
            content = `${content.slice(0, lastPeriodIndex)}，${finalExpansion}。${content.slice(lastPeriodIndex + 1)}`;
          } else {
            content = `${content.replace(/[，。！？]$/, "")}，${finalExpansion}。`;
          }
        } else {
          // 使用默认系统抽象扩展
          const defaultExpansion = "构建了完整的成长体系，形成了独特的生命叙事框架";
          if (content.includes("。")) {
            const lastPeriodIndex = content.lastIndexOf("。");
            content = `${content.slice(0, lastPeriodIndex)}，${defaultExpansion}。${content.slice(lastPeriodIndex + 1)}`;
          } else {
            content = `${content.replace(/[，。！？]$/, "")}，${defaultExpansion}。`;
          }
        }
        
        // 最终检查，确保不超过150字符
        if (content.length > 150) {
          let truncateIndex = 150;
          while (truncateIndex > 140 && /[\u4e00-\u9fa5]/.test(content.charAt(truncateIndex))) {
            truncateIndex--;
          }
          content = content.slice(0, truncateIndex + 1);
          if (!content.endsWith("。")) content += "。";
        }
      }
      
      // 最终优化：确保内容具有系统性和抽象性，避免简单堆砌
      if (!/系统|体系|框架|逻辑|抽象|规律|模式/.test(content)) {
        // 如果内容缺乏系统抽象元素，添加一个简短的系统抽象短语
        const shortSystematicPhrases = [
          "，形成了独特的成长体系",
          "，构建了完整的生命框架",
          "，在系统视角下展现价值",
          "，从抽象维度彰显意义"
        ];
        
        const shortPhrase = shortSystematicPhrases[Math.floor(Math.random() * shortSystematicPhrases.length)];
        if (content.length + shortPhrase.length <= 150) {
          content = content.replace(/[，。！？]$/, "") + shortPhrase + "。";
        }
      }
      
      return content;
    };
    
    // 生成更具文学性和个性化的fallback卡片标题
    const createLiteraryTitle = (baseContent: string, theme: string) => {
      // 文学化标题库，按主题分类
      const literaryTitles: { [key: string]: string[] } = {
        journey: [
          "时光履痕", "旅途诗韵", "岁月足迹", "山河纪行",
          "行旅流光", "远方回望", "足迹成诗", "山河入梦"
        ],
        emotions: [
          "心迹流年", "情感诗章", "成长弦歌", "心灵之韵",
          "情韵流转", "心语流光", "成长印记", "心灵牧歌"
        ],
        tastes: [
          "生活诗味", "味蕾之诗", "烟火雅韵", "风味时光",
          "食光诗语", "雅韵闲情", "滋味人生", "生活雅趣"
        ],
        future: [
          "未来诗行", "梦想星途", "憧憬之帆", "明日如歌",
          "未来可期", "梦想之舟", "星途远志", "明日之诗"
        ]
      };
      
      // 从标题库中随机选择一个标题
      const titles = literaryTitles[theme] || [];
      return titles[Math.floor(Math.random() * titles.length)];
    };
    
    // Fallback - 使用之前生成的卡片
    return {
      cards: [card1, card2, card3, card4],
      visualTags: extractedKeywords.length > 0 ? extractedKeywords : ["star", "heart", "camera", "book", "music"],
      poem: `岁月如歌流转，\n${extractedKeywords[0] || "时光"}长明依然。\n回首往事如烟，\n步履不停向前。`,
      analysis: `这一年，你在生活的舞台上演绎着属于自己的精彩。${card1.content}，${card2.content}，${card3.content}，${card4.content}。每一个瞬间都如同一颗璀璨的星辰，在你的生命之河中闪烁着独特的光芒。`,
      keyword: extractedKeywords[0]?.toUpperCase() || "LIFE",
      animal: "Deer"
    };
  }
};
