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

    // Clean & extract Q&A pairs: 
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

    // Updated prompt for structured JSON feedback with a score
    let prompt = `You are an expert interview evaluator. Based on the following interview Q&A pairs, provide:\n\n1. An overallScore (1-10) representing how well the candidate performed.\n2. A paragraph of constructive feedback.\n\nRespond ONLY in the following JSON format:\n{\n  "overallScore": number,\n  "feedback": "text"\n}\n\nInterview:\n\n`;

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
        max_tokens: 1024,
      }),
    });

    const result = await response.json();
    let content = result?.choices?.[0]?.message?.content || "";

    // Remove markdown code block wrappers if present
    content = content.trim();
    if (content.startsWith("```") && content.endsWith("```")) {
      content = content.slice(3, -3).trim();

      // Remove language identifier if present (e.g. ```json)
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


