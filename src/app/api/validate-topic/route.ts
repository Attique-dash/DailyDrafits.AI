import { NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.Deep_Seek_API_KEY;

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

    // Call OpenRouter API with free DeepSeek model
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          {
            role: "system",
            content: "You are a topic validator. Simply respond with 'valid' if the input is a topic, or 'invalid' if it's not."
          },
          {
            role: "user",
            content: `Is "${topic}" a valid topic?`
          }
        ],
        max_tokens: 10,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      // If API call fails, still accept the topic if it passes basic checks
      return NextResponse.json({ isValid: true });
    }

    const data = await response.json();
    const validationResult = data.choices[0].message.content.toLowerCase();

    if (validationResult.includes("invalid")) {
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