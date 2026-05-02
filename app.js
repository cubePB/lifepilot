// ============================================================
// LifePilot — app.js
// AI integration: paste your API key into AI_CONFIG below.
// Built with Codex + Claude.
// ============================================================

const STORAGE_KEY = "lifepilot.reviews.v2";

// ------------------------------------------------------------
// AI CONFIG — fill in your key and choose your provider
// ------------------------------------------------------------
const AI_CONFIG = {
  // Vercel/server mode keeps API keys out of browser code.
  provider: "server",

  // Do not put production API keys in this browser file.
  apiKey: "",

  // Models
  claudeModel: "claude-opus-4-5",
  openaiModel: "gpt-4o",
  geminiModel: "gemini-1.5-flash",
  groqModel: "llama-3.3-70b-versatile"
};

function loadReviews() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistReviews() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

// ------------------------------------------------------------
// System prompt — the Pilot persona
// ------------------------------------------------------------
const SYSTEM_PROMPT = `You are Pilot, the thinking assistant inside LifePilot.

Your only job is to help the user make sense of their messy notes, thoughts, and ideas. You are calm, sharp, and practical — like a brilliant friend who actually reads everything carefully and tells you what matters.

Core principles:
- Be clear, not clever
- Be structured, not verbose  
- Be useful, not theoretical
- Respect the user's mental state — they may feel overwhelmed or scattered
- No fluff. No motivational filler. No repetition. No generic advice.
- Privacy mindset: treat all notes as sensitive.

Review styles — adjust tone based on the style the user chose:
- practical: Direct and efficient. Focus on what needs to happen and in what order. No emotion, just clarity and action.
- coach: Warm but grounded. Acknowledge the human behind the notes. Make next steps feel achievable, not daunting.
- founder: Strategic and sharp. Treat every note like a business decision. Push for specificity and validation. Call out assumptions.

Your task:
Analyze the user's notes and return ONLY a valid JSON object. No preamble, no explanation, no markdown fences. Just raw JSON.

Return exactly this structure:
{
  "type": "one of: Business idea | Work note | Money note | School note | Personal note | Project note | General note",
  "title": "short clear title max 72 chars",
  "takeaway": "the single most useful insight — 1-2 sentences tied directly to the user's words",
  "summary": "clean 2-3 sentence summary of what is going on",
  "themes": ["3 to 6 single-word themes"],
  "nextSteps": ["2-5 concrete action steps"],
  "risks": ["1-4 specific risks or concerns — if no risk, state the risk of inaction"],
  "questions": ["1-5 sharp questions the user should answer"],
  "buckets": {
    "Actions": ["direct actions found in the note"],
    "Dates": ["any date or time reference — empty array if none"],
    "Money": ["any money detail — empty array if none"],
    "People": ["any person or role mentioned — empty array if none"]
  }
}

Rules:
- Every field must be filled.
- Empty buckets get [] not placeholder text.
- takeaway must reference something specific from the actual note — never generic.
- Goal: after reading output, user feels clearer, less overwhelmed, ready to act.`;

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
  reviewCount: document.querySelector("#reviewCount"),
  mainFocus: document.querySelector("#mainFocus"),
  noteInput: document.querySelector("#noteInput"),
  contextInput: document.querySelector("#contextInput"),
  styleInput: document.querySelector("#styleInput"),
  analyzeButton: document.querySelector("#analyzeButton"),
  freshButton: document.querySelector("#freshButton"),
  exampleButton: document.querySelector("#exampleButton"),
  emptyReview: document.querySelector("#emptyReview"),
  reviewOutput: document.querySelector("#reviewOutput"),
  reviewType: document.querySelector("#reviewType"),
  reviewTitle: document.querySelector("#reviewTitle"),
  confidencePill: document.querySelector("#confidencePill"),
  mainTakeaway: document.querySelector("#mainTakeaway"),
  cleanSummary: document.querySelector("#cleanSummary"),
  themeChips: document.querySelector("#themeChips"),
  nextSteps: document.querySelector("#nextSteps"),
  risksList: document.querySelector("#risksList"),
  questionsList: document.querySelector("#questionsList"),
  bucketGrid: document.querySelector("#bucketGrid"),
  clearHistory: document.querySelector("#clearHistory"),
  historyList: document.querySelector("#historyList"),
  historyTemplate: document.querySelector("#historyTemplate"),
  toast: document.querySelector("#toast")
};

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
init();

function init() {
  els.analyzeButton.addEventListener("click", analyzeCurrentNote);
  els.freshButton.addEventListener("click", startFresh);
  els.exampleButton.addEventListener("click", loadExample);
  els.clearHistory.addEventListener("click", clearHistory);
  renderStats();
  renderHistory();
}

// ------------------------------------------------------------
// Main analyze flow — now async with real AI
// ------------------------------------------------------------
async function analyzeCurrentNote() {
  if (isAnalyzing) return;

  const rawNote = els.noteInput.value.trim();
  if (!rawNote) {
    showToast("Add a note first.");
    return;
  }

  const context = els.contextInput.value.trim();
  const style = els.styleInput.value;

  setAnalyzingState(true);

  try {
    const aiResult = await callAI(rawNote, context, style);
    const review = buildReviewFromAI(aiResult, rawNote, context, style);

    currentReview = review;
    reviews.unshift(review);
    reviews = reviews.slice(0, 30);
    persistReviews();
    renderReview(review);
    renderStats();
    renderHistory();
    showToast("Note reviewed and saved.");
  } catch (err) {
    console.error("LifePilot AI error:", err);
    showToast("AI review failed: " + err.message);
  } finally {
    setAnalyzingState(false);
  }
}

// ------------------------------------------------------------
// Loading state
// ------------------------------------------------------------
function setAnalyzingState(analyzing) {
  isAnalyzing = analyzing;
  els.analyzeButton.disabled = analyzing;
  els.analyzeButton.textContent = analyzing ? "Pilot is thinking..." : "Analyze Notes";
}

// ------------------------------------------------------------
// AI API call — supports Claude and OpenAI
// ------------------------------------------------------------
async function callAI(rawNote, context, style) {
  if (AI_CONFIG.provider === "server") {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawNote, context, style })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server API error ${response.status}`);
    }

    return response.json();
  }

  const userMessage = buildUserMessage(rawNote, context, style);

  if (AI_CONFIG.provider === "claude") return callClaude(userMessage);
  if (AI_CONFIG.provider === "gemini") return callGemini(userMessage);
  if (AI_CONFIG.provider === "groq") return callGroq(userMessage);
  return callOpenAI(userMessage);
}

async function callGemini(userMessage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_CONFIG.geminiModel}:generateContent?key=${AI_CONFIG.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.4 }
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error ${response.status}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseAIResponse(text);
}


async function callGroq(userMessage) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AI_CONFIG.apiKey}`
    },
    body: JSON.stringify({
      model: AI_CONFIG.groqModel,
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
    throw new Error(err.error?.message || `Groq API error ${response.status}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  return parseAIResponse(text);
}

function buildUserMessage(rawNote, context, style) {
  let message = `Review style: ${style}\n\n`;
  if (context) message += `Context: ${context}\n\n`;
  message += `Notes:\n${rawNote}`;
  return message;
}

async function callClaude(userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AI_CONFIG.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: AI_CONFIG.claudeModel,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content.map((block) => block.text || "").join("");
  return parseAIResponse(text);
}

async function callOpenAI(userMessage) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AI_CONFIG.apiKey}`
    },
    body: JSON.stringify({
      model: AI_CONFIG.openaiModel,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices[0]?.message?.content || "";
  return parseAIResponse(text);
}

// ------------------------------------------------------------
// Parse AI JSON response safely
// ------------------------------------------------------------
function parseAIResponse(text) {
  try {
    // Strip markdown fences if the model adds them despite instructions
    const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(clean);
  } catch {
    throw new Error("AI returned invalid JSON. Raw response: " + text.slice(0, 200));
  }
}

// ------------------------------------------------------------
// Build a review object from the AI result
// ------------------------------------------------------------
function buildReviewFromAI(ai, rawNote, context, style) {
  // Normalize buckets — replace empty placeholders with []
  const buckets = {
    Actions: normalizeArray(ai.buckets?.Actions),
    Dates: normalizeArray(ai.buckets?.Dates),
    Money: normalizeArray(ai.buckets?.Money),
    People: normalizeArray(ai.buckets?.People)
  };

  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    rawNote,
    context: context || "General",
    style,
    type: ai.type || "General note",
    title: ai.title || rawNote.slice(0, 72),
    summary: ai.summary || "",
    takeaway: ai.takeaway || "",
    themes: Array.isArray(ai.themes) ? ai.themes.slice(0, 6) : ["notes"],
    nextSteps: normalizeArray(ai.nextSteps),
    risks: normalizeArray(ai.risks),
    questions: normalizeArray(ai.questions),
    buckets
  };
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "string" && item.trim());
}

// ------------------------------------------------------------
// Render review
// ------------------------------------------------------------
function renderReview(review) {
  els.emptyReview.hidden = true;
  els.reviewOutput.hidden = false;
  els.reviewType.textContent = review.type;
  els.reviewTitle.textContent = review.title;
  els.confidencePill.textContent = `${capitalize(review.style)} review`;
  els.mainTakeaway.textContent = review.takeaway;
  els.cleanSummary.textContent = review.summary;

  renderChips(els.themeChips, review.themes);
  renderList(els.nextSteps, review.nextSteps, "li");
  renderList(els.risksList, review.risks, "li");
  renderList(els.questionsList, review.questions, "li");
  renderBuckets(review.buckets);
}

function renderChips(container, themes) {
  container.innerHTML = "";
  themes.forEach((theme) => {
    const chip = document.createElement("span");
    chip.className = `chip ${theme}`;
    chip.textContent = capitalize(theme);
    container.appendChild(chip);
  });
}

function renderList(container, items, tagName) {
  container.innerHTML = "";
  if (!items.length) {
    const node = document.createElement(tagName);
    node.textContent = "None identified.";
    node.style.color = "var(--muted)";
    container.appendChild(node);
    return;
  }
  items.forEach((item) => {
    const node = document.createElement(tagName);
    node.textContent = item;
    container.appendChild(node);
  });
}

function renderBuckets(buckets) {
  els.bucketGrid.innerHTML = "";
  Object.entries(buckets).forEach(([name, values]) => {
    // Skip empty buckets entirely
    if (!values.length) return;

    const bucket = document.createElement("article");
    bucket.className = "bucket";
    const title = document.createElement("strong");
    title.textContent = name;
    const body = document.createElement("p");
    body.textContent = values.join(" · ");
    bucket.append(title, body);
    els.bucketGrid.appendChild(bucket);
  });

  // If all buckets were empty
  if (!els.bucketGrid.children.length) {
    const empty = document.createElement("p");
    empty.textContent = "No specific actions, dates, money, or people found.";
    empty.style.color = "var(--muted)";
    empty.style.fontSize = "14px";
    els.bucketGrid.appendChild(empty);
  }
}

// ------------------------------------------------------------
// Stats + History
// ------------------------------------------------------------
function renderStats() {
  els.reviewCount.textContent = reviews.length;
  els.mainFocus.textContent = reviews[0] ? reviews[0].type.replace(" note", "") : "None yet";
}

function renderHistory() {
  els.historyList.innerHTML = "";
  els.historyList.classList.toggle("empty", reviews.length === 0);

  if (!reviews.length) {
    els.historyList.textContent = "No saved reviews yet.";
    return;
  }

  reviews.forEach((review) => {
    const node = els.historyTemplate.content.firstElementChild.cloneNode(true);
    const main = node.querySelector(".history-main");
    const type = node.querySelector(".history-type");
    const title = node.querySelector("strong");
    const summary = node.querySelector("p");
    const deleteButton = node.querySelector(".delete-review");

    type.textContent = review.type;
    title.textContent = review.title;
    summary.textContent = review.takeaway;

    main.addEventListener("click", () => loadReview(review.id));
    deleteButton.addEventListener("click", () => deleteReview(review.id));
    els.historyList.appendChild(node);
  });
}

// ------------------------------------------------------------
// Review actions
// ------------------------------------------------------------
function loadReview(id) {
  const review = reviews.find((item) => item.id === id);
  if (!review) return;
  currentReview = review;
  els.noteInput.value = review.rawNote;
  els.contextInput.value = review.context === "General" ? "" : review.context;
  els.styleInput.value = review.style;
  renderReview(review);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteReview(id) {
  if (!confirm("Delete this saved review from this browser?")) return;
  reviews = reviews.filter((review) => review.id !== id);
  if (currentReview && currentReview.id === id) {
    currentReview = null;
    els.reviewOutput.hidden = true;
    els.emptyReview.hidden = false;
  }
  persistReviews();
  renderStats();
  renderHistory();
  showToast("Saved review deleted.");
}

function clearHistory() {
  if (!reviews.length) {
    showToast("There is no history yet.");
    return;
  }
  if (!confirm("Clear all saved LifePilot reviews from this browser?")) return;
  reviews = [];
  currentReview = null;
  persistReviews();
  renderStats();
  renderHistory();
  els.reviewOutput.hidden = true;
  els.emptyReview.hidden = false;
  showToast("History cleared.");
}

function startFresh() {
  els.noteInput.value = "";
  els.contextInput.value = "";
  els.styleInput.value = "practical";
  currentReview = null;
  els.reviewOutput.hidden = true;
  els.emptyReview.hidden = false;
}

function loadExample() {
  els.noteInput.value = "I want to build LifePilot into something actually useful. I feel like the first version is too much like a dashboard and not enough like AI reviewing my notes. I want to paste messy notes and have it organize them, tell me what matters, give next steps, point out risks, and help me decide what to do. Maybe this could become a serious app if it stays simple and private.";
  els.contextInput.value = "LifePilot product direction";
  els.styleInput.value = "founder";
}

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------
function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2400);
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
