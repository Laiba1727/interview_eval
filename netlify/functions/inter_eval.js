const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const messages = body.messages || [];

    if (messages.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No messages provided" }),
      };
    }

    // Extract valid Q&A pairs
    const qaPairs = [];
    for (let i = 0; i < messages.length - 1; i++) {
      if (
        messages[i].sender.toLowerCase() === "morgan" &&
        !messages[i].content.toLowerCase().includes("error") &&
        messages[i + 1].sender.toLowerCase() === "user"
      ) {
        qaPairs.push({
          question: messages[i].content.trim(),
          answer: messages[i + 1].content.trim(),
        });
      }
    }

    if (qaPairs.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No valid Q&A pairs found" }),
      };
    }

    // Construct prompt for detailed structured response with per-QA insights (no headings)
    let prompt = `You are an expert interview evaluator. Based on the following interview Q&A pairs, analyze the candidate and provide ONLY a well-detailed JSON response in the exact format below:

{
  "perAnswerInsights": [
    {
      "question": "...",
      "answer": "...",
      "insight": "Detailed analysis and feedback for this Q&A here, written in professional and specific language."
    }
  ],
  "technicalMistakes": ["..."],
  "communicationMistakes": ["..."],
  "strengths": ["..."],
  "areasToImprove": ["..."],
  "recommendations": ["..."],
  "overallScore": number
}

For the "perAnswerInsights", provide a detailed paragraph or two of analysis for each question-answer pair without dividing it into subcategories. Use clear and professional language.

For the general evaluation sections, include at least 2–4 specific, insightful points each.

Respond ONLY with valid JSON. Do not include any markdown, commentary, or explanation.

Interview Q&A:\n\n`;

    qaPairs.forEach((pair) => {
      prompt += `Question: ${pair.question}\nAnswer: ${pair.answer}\n\n`;
    });

    // Call Groq API
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content: "You are a professional interviewer and evaluator.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    const result = await response.json();
    let content = result?.choices?.[0]?.message?.content || "";

    // Remove markdown formatting if present
    content = content.trim();
    if (content.startsWith("```") && content.endsWith("```")) {
      content = content.slice(3, -3).trim();
      if (content.startsWith("json")) {
        content = content.slice(4).trim();
      }
    }

    let structuredOutput;
    try {
      structuredOutput = JSON.parse(content);
    } catch (parseError) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to parse model response as JSON.",
          rawResponse: content,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(structuredOutput),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

