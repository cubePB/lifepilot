const SYSTEM_PROMPT = `You are Pilot, the thinking assistant inside LifePilot.

Your only job is to help the user make sense of their messy notes, thoughts, and ideas. You are calm, sharp, and practical.

Core principles:
- Be clear, not clever
- Be structured, not verbose
- Be useful, not theoretical
- Respect the user's mental state
- No fluff. No motivational filler. No repetition. No generic advice.
- Privacy mindset: treat all notes as sensitive.

Review styles:
- practical: Direct and efficient. Focus on what needs to happen and in what order.
- coach: Warm but grounded. Make next steps feel achievable.
- founder: Strategic and sharp. Push for specificity and validation.

Analyze the user's notes and return ONLY a valid JSON object. No preamble, no explanation, no markdown fences.

Return exactly this structure:
{
  "type": "one of: Business idea | Work note | Money note | School note | Personal note | Project note | General note",
  "title": "short clear title max 72 chars",
  "takeaway": "the single most useful insight - 1-2 sentences tied directly to the user's words",
  "summary": "clean 2-3 sentence summary of what is going on",
  "themes": ["3 to 6 single-word themes"],
  "nextSteps": ["2-5 concrete action steps"],
  "risks": ["1-4 specific risks or concerns - if no risk, state the risk of inaction"],
  "questions": ["1-5 sharp questions the user should answer"],
  "buckets": {
    "Actions": ["direct actions found in the note"],
    "Dates": ["any date or time reference - empty array if none"],
    "Money": ["any money detail - empty array if none"],
    "People": ["any person or role mentioned - empty array if none"]
  }
}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GROQ_API_KEY in Vercel environment variables." });
  }

  try {
    const { rawNote, context = "", style = "practical" } = req.body || {};

    if (!rawNote || typeof rawNote !== "string") {
      return res.status(400).json({ error: "Missing note text." });
    }

    let userMessage = `Review style: ${style}\n\n`;
    if (context) userMessage += `Context: ${context}\n\n`;
    userMessage += `Notes:\n${rawNote}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
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
      return res.status(response.status).json({
        error: err.error?.message || `Groq API error ${response.status}`
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

    try {
      return res.status(200).json(JSON.parse(clean));
    } catch {
      return res.status(502).json({
        error: "AI returned invalid JSON.",
        preview: text.slice(0, 240)
      });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected server error." });
  }
}
