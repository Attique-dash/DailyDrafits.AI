import { NextResponse } from "next/server";
import OpenAI from "openai";

const OPENROUTER_API_KEY = process.env.Deep_Seek_API_KEY;

// Working free models on OpenRouter (updated 2026)
const MODELS = [
  "tencent/hy3-preview:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-120b:free",
  "minimax/minimax-m2.5:free",
  "z-ai/glm-4.5-air:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "openai/gpt-oss-20b:free",
];

// Create OpenAI client configured for OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY || "",
});

// Sleep utility for retry delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Validate topic with retry logic and model fallback
const validateTopicWithAI = async (topic: string, attempt = 0, modelIndex = 0): Promise<boolean> => {
  if (!OPENROUTER_API_KEY) {
    // If no API key, accept topic if it passes basic validation
    return true;
  }

  if (modelIndex >= MODELS.length) {
    // All models exhausted, accept the topic
    console.log("All models exhausted, accepting topic");
    return true;
  }

  const model = MODELS[modelIndex];
  console.log(`Validation attempt ${attempt + 1} using model: ${model}`);

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a topic validator. Simply respond with 'valid' if the input is a topic, or 'invalid' if it's not.",
        },
        {
          role: "user",
          content: `Is "${topic}" a valid topic?`,
        },
      ],
      max_tokens: 10,
      temperature: 0.1,
    });

    const validationResult = response.choices?.[0]?.message?.content?.toLowerCase() || "";
    return !validationResult.includes("invalid");
  } catch (error: any) {
    console.error(`Error validating with model ${model}:`, error.message);

    // Check if it's a rate limit error (429) or model not found (404)
    const isRateLimit = error.status === 429 || error.message?.includes("rate-limited") || error.message?.includes("429");
    const isNotFound = error.status === 404 || error.message?.includes("No endpoints found") || error.message?.includes("404");
    
    if (isRateLimit || isNotFound) {
      // Try next model immediately
      console.log(`Model ${model} unavailable (${isRateLimit ? 'rate limited' : 'not found'}), trying next model...`);
      return validateTopicWithAI(topic, 0, modelIndex + 1);
    }

    // For other transient errors, retry with exponential backoff up to 2 times
    if (attempt < 2) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
      return validateTopicWithAI(topic, attempt + 1, modelIndex);
    }

    // If retries exhausted, try next model
    return validateTopicWithAI(topic, 0, modelIndex + 1);
  }
};

export async function POST(req: Request) {
  try {
    const { topic } = await req.json();

    if (!topic) {
      return NextResponse.json(
        { isValid: false, message: "Please enter a topic" },
        { status: 400 }
      );
    }

    // Only check for very basic requirements
    if (topic.length < 2) {
      return NextResponse.json({
        isValid: false,
        message: "Topic must be at least 2 characters long"
      });
    }

    // Check for only random characters or numbers
    const randomCharsRegex = /^[^a-zA-Z]+$/;
    if (randomCharsRegex.test(topic)) {
      return NextResponse.json({
        isValid: false,
        message: "Please enter a meaningful topic"
      });
    }

    // Call OpenRouter API with retry and fallback logic
    const isValid = await validateTopicWithAI(topic);

    if (!isValid) {
      return NextResponse.json({
        isValid: false,
        message: "Please enter a meaningful topic"
      });
    }

    return NextResponse.json({ isValid: true });
  } catch (error) {
    console.error("Error validating topic:", error);
    // If any error occurs, still accept the topic if it passes basic checks
    return NextResponse.json({ isValid: true });
  }
}
