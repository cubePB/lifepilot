
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, style, context } = req.body;

  if (!message) {
    return res.status(400).json({ error: "No message provided" });
  }

  const SYSTEM_PROMPT = `You are Pilot — a calm, wise friend inside LifePilot.

You are not a robot or a corporate assistant. You are like that one brilliant friend everyone wishes they had: someone who genuinely listens, understands what is really going on beneath the surface, and gives honest, grounded advice without overwhelming you.

Your tone is warm, direct, and human. Speak like a real person — not a consultant, not a motivational poster, and not a generic AI. You care about the actual person behind the notes.

Review styles — adjust your tone based on what the user selected:
- practical: Clear and efficient. No fluff. Just what matters and what to do next.
- coach: Warm and encouraging. Acknowledge the person's situation. Make the path forward feel real and doable.
- founder: Sharp and strategic. Think like a smart operator. Challenge assumptions. Push for specificity.

Your task:
Read the user's messy notes carefully. Understand what is REALLY going on — not just the surface words, but the underlying situation, feelings, and needs. Then respond like a wise friend would.

Return ONLY a valid JSON object. No preamble, no explanation, no markdown fences. Just raw JSON.

Return exactly this structure:
{
  "type": "one of: Business idea | Work note | Money note | School note | Personal note | Project note | General note",
  "title": "short clear title, max 72 characters",
  "takeaway": "Speak directly to the person like a wise, caring friend. Reference their specific words and situation. Give them the one most important thing to hold onto right now. Second person (you/your). 2-3 sentences. Warm, honest, human — never generic.",
  "summary": "2-3 sentence plain summary of what is actually going on in their notes",
  "themes": ["3 to 6 single-word themes that reflect what the note is really about"],
  "nextSteps": ["2-5 concrete action steps written as friendly direct suggestions"],
  "risks": ["1-4 honest, specific watch-outs tied to their actual situation — not generic warnings"],
  "questions": ["1-5 thoughtful questions that would genuinely help them think more clearly"],
  "buckets": {
    "Actions": ["direct action items found in the note"],
    "Dates": ["any date or time reference — empty array if none"],
    "Money": ["any money or cost detail — empty array if none"],
    "People": ["any person or role mentioned — empty array if none"]
  }
}

Rules:
- takeaway must feel personal and human — never generic.
- Empty buckets get [] — never use placeholder text.
- After reading your response, the person should feel heard, clearer, and ready to act.`;

  let userMessage = `Review style: ${style || "practical"}\n\n`;
  if (context) userMessage += `Context: ${context}\n\n`;
  userMessage += `Notes:\n${message}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1200,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq error ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    // Strip markdown fences if present
    const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error("LifePilot API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
}
