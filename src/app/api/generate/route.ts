import { NextResponse } from "next/server";
import { Article } from "@/app/types/article";
import OpenAI from "openai";

const OPENROUTER_API_KEY = process.env.Deep_Seek_API_KEY;
const SITE_URL = "http://localhost:3000";
const SITE_NAME = "AI Content Generator";

// Working free models on OpenRouter (updated 2026)
// Check https://openrouter.ai/models?max_price=0 for latest
const MODELS = [
  "tencent/hy3-preview:free",        // Tencent Hunyuan 3 Preview
  "nvidia/nemotron-3-super-120b-a12b:free",  // Nvidia Nemotron Super 120B
  "openai/gpt-oss-120b:free",         // OpenAI GPT-OSS 120B
  "minimax/minimax-m2.5:free",        // MiniMax M2.5
  "z-ai/glm-4.5-air:free",            // Z-AI GLM 4.5 Air
  "nvidia/nemotron-3-nano-30b-a3b:free", // Nvidia Nemotron Nano 30B
  "openai/gpt-oss-20b:free",          // OpenAI GPT-OSS 20B
];

// Create OpenAI client configured for OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": SITE_URL,
    "X-Title": SITE_NAME,
  },
});

// Sleep utility for retry delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Track last API call time for cooldown
let lastApiCallTime = 0;
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes cooldown

// Generate content with retry logic and model fallback
const generateAIContent = async (topic: string, attempt = 0, modelIndex = 0): Promise<{ title: string; description: string; modelUsed: string }> => {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key is not configured");
  }

  // Check cooldown
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;
  if (timeSinceLastCall < COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((COOLDOWN_MS - timeSinceLastCall) / 1000);
    throw new Error(`Please wait ${remainingSeconds} seconds before generating again.`);
  }

  if (modelIndex >= MODELS.length) {
    throw new Error("All models are currently rate limited. Please try again in a few minutes.");
  }

  const model = MODELS[modelIndex];
  console.log(`Attempt ${attempt + 1} using model: ${model}`);

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a content writer. Create a title and description for the given topic. Respond in this exact format:\nTitle: [your title here]\nDescription: [your description here]",
        },
        {
          role: "user",
          content: `Write about "${topic}"`,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content received from API");
    }

    // Extract title and description
    const titleMatch = content.match(/Title:\s*(.+?)(?:\n|$)/i);
    const descriptionMatch = content.match(/Description:\s*(.+?)(?:\n|$)/i);

    if (!titleMatch || !descriptionMatch) {
      console.error("Could not parse content:", content);
      throw new Error("Could not parse API response");
    }

    // Update last API call time on success
    lastApiCallTime = Date.now();
    
    return {
      title: titleMatch[1].trim(),
      description: descriptionMatch[1].trim(),
      modelUsed: model,
    };
  } catch (error: any) {
    console.error(`Error with model ${model}:`, error.message);

    // Check if it's a rate limit error (429) or model not found (404)
    const isRateLimit = error.status === 429 || error.message?.includes("rate-limited") || error.message?.includes("429");
    const isNotFound = error.status === 404 || error.message?.includes("No endpoints found") || error.message?.includes("404");
    
    if (isRateLimit || isNotFound) {
      // Try next model immediately
      console.log(`Model ${model} unavailable (${isRateLimit ? 'rate limited' : 'not found'}), trying next model...`);
      return generateAIContent(topic, 0, modelIndex + 1);
    }

    // For other transient errors, retry with exponential backoff up to 2 times
    if (attempt < 2) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
      return generateAIContent(topic, attempt + 1, modelIndex);
    }

    // If retries exhausted, try next model
    return generateAIContent(topic, 0, modelIndex + 1);
  }
};

// POST handler for route
export async function POST(req: Request) {
  try {
    const { topic } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: "Please enter a topic" }, { status: 400 });
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "API key is not configured" }, { status: 500 });
    }

    console.log("Generating content for topic:", topic);

    const result = await generateAIContent(topic);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in generate route:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to generate content",
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
