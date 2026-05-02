// ============================================================
// LifePilot — app.js
// Built with Codex + Claude.
// Add your API key to AI_CONFIG below before running.
// ============================================================

const STORAGE_KEY = "lifepilot.reviews.v3";

// ------------------------------------------------------------
// AI CONFIG
// provider: "groq" | "claude" | "openai" | "gemini"
// ------------------------------------------------------------
const AI_CONFIG = {
  provider: "groq",
  apiKey: "YOUR_API_KEY_HERE",
  claudeModel: "claude-opus-4-5",
  openaiModel: "gpt-4o",
  geminiModel: "gemini-2.0-flash",
  groqModel: "llama-3.3-70b-versatile"
};

// ------------------------------------------------------------
// System prompt — Pilot persona: calm wise friend
// ------------------------------------------------------------
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

Non-negotiable rules:
- takeaway must feel personal. Read their actual words and respond to THEM specifically, not to a generic person.
- Empty buckets get [] — never use placeholder text like "none found".
- nextSteps must be actionable and specific to their notes, not generic life advice.
- After reading your response, the person should feel heard, clearer, and ready to act.`;

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
let reviews = loadReviews();
let currentReview = null;
let isAnalyzing = false;

// ------------------------------------------------------------
// DOM refs
// ------------------------------------------------------------
const els = {
  reviewCount:   document.querySelector("#reviewCount"),
  noteInput:     document.querySelector("#noteInput"),
  contextInput:  document.querySelector("#contextInput"),
  styleInput:    document.querySelector("#styleInput"),
  analyzeButton: document.querySelector("#analyzeButton"),
  freshButton:   document.querySelector("#freshButton"),
  exampleButton: document.querySelector("#exampleButton"),
  btnText:       document.querySelector("#btnText"),
  emptyState:    document.querySelector("#emptyState"),
  thinkingState: document.querySelector("#thinkingState"),
  pilotOutput:   document.querySelector("#pilotOutput"),
  styleTag:      document.querySelector("#styleTag"),
  mainTakeaway:  document.querySelector("#mainTakeaway"),
  cleanSummary:  document.querySelector("#cleanSummary"),
  themeChips:    document.querySelector("#themeChips"),
  nextSteps:     document.querySelector("#nextSteps"),
  risksList:     document.querySelector("#risksList"),
  questionsList: document.querySelector("#questionsList"),
  bucketGrid:    document.querySelector("#bucketGrid"),
  saveButton:    document.querySelector("#saveButton"),
  clearHistory:  document.querySelector("#clearHistory"),
  historyList:   document.querySelector("#historyList"),
  historyWrap:   document.querySelector("#historyWrap"),
  historyTemplate: document.querySelector("#historyTemplate"),
  toast:         document.querySelector("#toast")
};

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
init();

function init() {
  els.analyzeButton.addEventListener("click", analyzeNote);
  els.freshButton.addEventListener("click", clearNote);
  els.exampleButton.addEventListener("click", loadExample);
  els.saveButton.addEventListener("click", saveReview);
  els.clearHistory.addEventListener("click", clearAllHistory);
  updateCount();
  renderHistory();
}

// ------------------------------------------------------------
// Analyze flow
// ------------------------------------------------------------
async function analyzeNote() {
  if (isAnalyzing) return;

  const rawNote = els.noteInput.value.trim();
  if (!rawNote) { showToast("Write or paste some notes first."); return; }

  if (AI_CONFIG.apiKey === "YOUR_API_KEY_HERE") {
    showToast("Add your API key to app.js first.");
    return;
  }

  const context = els.contextInput.value.trim();
  const style = els.styleInput.value;

  setLoading(true);

  try {
    const aiResult = await callAI(rawNote, context, style);
    currentReview = buildReview(aiResult, rawNote, context, style);
    showResponse(currentReview);
    showToast("Pilot reviewed your note!");
  } catch (err) {
    console.error("LifePilot AI error:", err);
    showToast("Something went wrong: " + err.message);
    showEmpty();
  } finally {
    setLoading(false);
  }
}

// ------------------------------------------------------------
// Loading / state helpers
// ------------------------------------------------------------
function setLoading(on) {
  isAnalyzing = on;
  els.analyzeButton.disabled = on;
  els.btnText.textContent = on ? "Thinking..." : "Ask Pilot";

  if (on) {
    els.emptyState.hidden = true;
    els.pilotOutput.hidden = true;
    els.thinkingState.hidden = false;
  }
}

function showEmpty() {
  els.emptyState.hidden = false;
  els.thinkingState.hidden = true;
  els.pilotOutput.hidden = true;
}

// ------------------------------------------------------------
// AI API calls
// ------------------------------------------------------------
async function callAI(rawNote, context, style) {
  const msg = buildMessage(rawNote, context, style);
  if (AI_CONFIG.provider === "claude")  return callClaude(msg);
  if (AI_CONFIG.provider === "gemini")  return callGemini(msg);
  if (AI_CONFIG.provider === "groq")    return callGroq(msg);
  return callOpenAI(msg);
}

function buildMessage(rawNote, context, style) {
  let m = `Review style: ${style}\n\n`;
  if (context) m += `Context: ${context}\n\n`;
  m += `Notes:\n${rawNote}`;
  return m;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
