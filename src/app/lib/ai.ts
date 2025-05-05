// Free AI service using Hugging Face Inference API
export const generateArticle = async (previousPosts: any[]) => {
    // Training context for the AI
    const trainingExamples = `
      Example Articles:
      1. Title: "The Future of Renewable Energy"
         Content: "Recent advancements in solar panel technology have increased efficiency by 25%. Experts predict widespread adoption could reduce global carbon emissions by 15% in the next decade."
  
      2. Title: "AI in Healthcare: Revolutionizing Diagnostics"
         Content: "Machine learning models can now detect early signs of diseases from medical scans with 95% accuracy, significantly improving patient outcomes."
  
      3. Title: "Quantum Computing Breakthrough"
         Content: "Scientists have achieved quantum supremacy with a 128-qubit processor, solving problems intractable for classical computers."
    `;
  
    const previousContext = previousPosts.length > 0
      ? `Previous Articles:\n${previousPosts
          .slice(0, 3)
          .map((p, i) => `${i + 1}. Title: "${p.title}"\n   Content: "${p.description}"`)
          .join('\n')}`
      : "No previous articles available";
  
    const prompt = `
      ${trainingExamples}
      
      ${previousContext}
      
      Generate a new technology news article with:
      - A compelling title (max 10 words)
      - Detailed content (3-5 paragraphs)
      - Based on recent trends
      - Related to the context provided
      
      Respond in this JSON format:
      {
        "title": "string",
        "description": "string",
        "url": "#"
      }
    `;
  
    try {
      // Using Hugging Face Inference API (free tier)
      const response = await fetch(
        "https://api-inference.huggingface.co/models/google/gemma-7b-it",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              temperature: 0.7,
              max_new_tokens: 500,
              return_full_text: false
            }
          }),
        }
      );
  
      if (!response.ok) {
        throw new Error(`AI API error: ${response.statusText}`);
      }
  
      const result = await response.json();
      const generatedText = result[0]?.generated_text || '';
  
      // Extract JSON from the response
      const jsonStart = generatedText.indexOf('{');
      const jsonEnd = generatedText.lastIndexOf('}') + 1;
      const jsonString = generatedText.slice(jsonStart, jsonEnd);
  
      try {
        const article = JSON.parse(jsonString);
        return {
          title: article.title || "Technology Update",
          description: article.description || "Latest developments in technology...",
          url: article.url || "#",
        };
      } catch (e) {
        // Fallback if JSON parsing fails
        return {
          title: "Tech News Update",
          description: generatedText || "Here's the latest in technology...",
          url: "#",
        };
      }
    } catch (error) {
      console.error("AI generation failed:", error);
      // Fallback to local generated content
      return {
        title: "Technology Roundup",
        description: `Today in technology:\n\n` +
          `1. New developments in AI are changing how we work.\n` +
          `2. Renewable energy solutions are becoming more efficient.\n` +
          `3. Space exploration technologies continue to advance.`,
        url: "#",
      };
    }
  };