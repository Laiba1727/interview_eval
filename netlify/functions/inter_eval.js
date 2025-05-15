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
    // Assume interview bot "Morgan" asks questions, "user" answers.
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

    // Prepare prompt for the LLM
    let prompt = `You are an expert interview evaluator. Given the following interview questions and candidate answers, provide detailed feedback on how well the candidate responded. Consider clarity, relevance, confidence, and areas for improvement.\n\n`;

    qaPairs.forEach((pair, idx) => {
      prompt += `Question ${idx + 1}: ${pair.question}\nAnswer ${idx + 1}: ${pair.answer}\n\n`;
    });

    // Call Groq API for evaluation
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
    const evaluation = result?.choices?.[0]?.message?.content || "No feedback received.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evaluation }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
