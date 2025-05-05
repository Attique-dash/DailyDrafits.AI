import { NextResponse } from "next/server";
import { Article } from "@/app/types/article";

const OPENROUTER_API_KEY = process.env.Deep_Seek_API_KEY;
const SITE_URL = "http://localhost:3000";
const SITE_NAME = "AI Content Generator";

// Generate unique content using OpenRouter
const generateAIContent = async (topic: string, previousTitles: string[] = []) => {
  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API key is not configured");
    }

    console.log("Starting API request for topic:", topic);
    console.log("Using API key:", OPENROUTER_API_KEY.substring(0, 10) + "...");
    
    const requestBody = {
      model: "deepseek/deepseek-r1:free",
      messages: [
        {
          role: "system",
          content: "You are an engaging writer. Respond with exactly two parts:\n1. Title: Create a compelling title in 1-2 lines (10-15 words max)\n2. Description: Write a detailed description in 6-7 complete sentences (no truncation). Make each sentence informative and engaging."
        },
        {
          role: "user",
          content: `Write an article about "${topic}" in the following format:
Title: [Your title here]
Description: [Your detailed description here]`
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.9
    };

    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": SITE_URL,
        "X-Title": SITE_NAME,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    console.log("API Response Status:", response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("API Error Response:", errorData);
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const responseData = await response.json();
    console.log("API Response Data:", JSON.stringify(responseData, null, 2));

    const content = responseData.choices?.[0]?.message?.content;
    if (!content) {
      console.error("No content in response:", responseData);
      throw new Error("No content received from API");
    }

    console.log("Raw content received:", content);

    // First try to extract using the expected format
    const titleMatch = content.match(/Title:\s*(.+?)(?:\n|$)/i);
    const descriptionMatch = content.match(/Description:\s*(.+?)(?:\n|$)/i);

    let title, description;

    if (titleMatch && descriptionMatch) {
      title = titleMatch[1].trim();
      description = descriptionMatch[1].trim();
    } else {
      // Fallback: try to split by newlines and take first two non-empty lines
      const lines = content.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);

      if (lines.length >= 2) {
        title = lines[0].replace(/^Title:\s*/i, '').trim();
        description = lines[1].replace(/^Description:\s*/i, '').trim();
      } else {
        console.error("Could not parse content format:", content);
        throw new Error("Invalid content format from API");
      }
    }

    if (!title || !description) {
      console.error("Empty title or description:", { title, description });
      throw new Error("Invalid content format from API");
    }

    const article = {
      title,
      description,
      createdAt: new Date().toISOString(),
      topic
    };

    console.log("Generated article:", article);
    return article;

  } catch (error) {
    console.error("Error in generateAIContent:", error);
    throw error;
  }
};

// POST handler for route
export async function POST(req: Request) {
  try {
    const { topic } = await req.json();

    if (!topic) {
      return NextResponse.json(
        { error: "Please enter a topic" },
        { status: 400 }
      );
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "API key is not configured" },
        { status: 500 }
      );
    }

    console.log("Generating content for topic:", topic);

    const requestBody = {
      model: "deepseek/deepseek-r1:free",
      messages: [
        {
          role: "system",
          content: "You are a content writer. Create a title and description for the given topic. Respond in this exact format:\nTitle: [your title here]\nDescription: [your description here]"
        },
        {
          role: "user",
          content: `Write about "${topic}"`
        }
      ],
      max_tokens: 300,
      temperature: 0.7,
    };

    console.log("Sending request to OpenRouter:", JSON.stringify(requestBody, null, 2));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Response status:", response.status);

    const responseText = await response.text();
    console.log("Raw response:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse response as JSON:", e);
      return NextResponse.json(
        { error: "Invalid response from API", details: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }

    if (!response.ok) {
      console.error("API Error Response:", data);
      return NextResponse.json(
        { error: data.error?.message || "Failed to generate content", details: data },
        { status: response.status }
      );
    }

    // Log the full response structure
    console.log("Parsed response data:", JSON.stringify(data, null, 2));

    // Get content from the response
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content found in response structure:", data);
      
      // Check if there's a refusal or reasoning in the response
      const refusal = data.choices?.[0]?.message?.refusal;
      const reasoning = data.choices?.[0]?.message?.reasoning;
      
      if (refusal || reasoning) {
        return NextResponse.json(
          { 
            error: "Content generation failed", 
            details: refusal || reasoning || "The model provided reasoning but no content"
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { 
          error: "No content received from API", 
          details: "Response structure: " + JSON.stringify(data)
        },
        { status: 500 }
      );
    }

    // Extract title and description
    const titleMatch = content.match(/Title:\s*(.+?)(?:\n|$)/i);
    const descriptionMatch = content.match(/Description:\s*(.+?)(?:\n|$)/i);

    if (!titleMatch || !descriptionMatch) {
      console.error("Could not parse content:", content);
      
      // Try to extract content from reasoning if available
      const reasoning = data.choices?.[0]?.message?.reasoning;
      if (reasoning) {
        const reasoningTitle = reasoning.match(/title.*?:?\s*(.+?)(?:\n|$)/i);
        const reasoningDesc = reasoning.match(/description.*?:?\s*(.+?)(?:\n|$)/i);
        
        if (reasoningTitle && reasoningDesc) {
          return NextResponse.json({
            title: reasoningTitle[1].trim(),
            description: reasoningDesc[1].trim()
          });
        }
      }

      return NextResponse.json(
        { 
          error: "Could not parse API response", 
          details: "Content format: " + content 
        },
        { status: 500 }
      );
    }

    const title = titleMatch[1].trim();
    const description = descriptionMatch[1].trim();

    return NextResponse.json({
      title,
      description
    });
  } catch (error) {
    console.error("Error in generate route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
