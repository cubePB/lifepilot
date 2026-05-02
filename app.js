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

async function callGroq(msg) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
        { role: "user", content: msg }
      ]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `Groq error ${res.status}`);
  }
  const data = await res.json();
  return parseJSON(data.choices?.[0]?.message?.content || "");
}

async function callClaude(msg) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
      messages: [{ role: "user", content: msg }]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `Claude error ${res.status}`);
  }
  const data = await res.json();
  return parseJSON(data.content.map(b => b.text || "").join(""));
}

async function callOpenAI(msg) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
        { role: "user", content: msg }
      ]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `OpenAI error ${res.status}`);
  }
  const data = await res.json();
  return parseJSON(data.choices?.[0]?.message?.content || "");
}

async function callGemini(msg) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_CONFIG.geminiModel}:generateContent?key=${AI_CONFIG.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: msg }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.4 }
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `Gemini error ${res.status}`);
  }
  const data = await res.json();
  return parseJSON(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

function parseJSON(text) {
  try {
    const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(clean);
  } catch {
    throw new Error("Pilot returned an unexpected response. Try again.");
  }
}

// ------------------------------------------------------------
// Build review object
// ------------------------------------------------------------
function buildReview(ai, rawNote, context, style) {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    rawNote,
    context: context || "General",
    style,
    type: ai.type || "General note",
    title: ai.title || rawNote.slice(0, 72),
    takeaway: ai.takeaway || "",
    summary: ai.summary || "",
    themes: Array.isArray(ai.themes) ? ai.themes.slice(0, 6) : [],
    nextSteps: clean(ai.nextSteps),
    risks: clean(ai.risks),
    questions: clean(ai.questions),
    buckets: {
      Actions: clean(ai.buckets?.Actions),
      Dates:   clean(ai.buckets?.Dates),
      Money:   clean(ai.buckets?.Money),
      People:  clean(ai.buckets?.People)
    }
  };
}

function clean(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(x => x && typeof x === "string" && x.trim());
}

// ------------------------------------------------------------
// Render response
// ------------------------------------------------------------
function showResponse(review) {
  els.thinkingState.hidden = true;
  els.emptyState.hidden = true;
  els.pilotOutput.hidden = false;

  els.styleTag.textContent = cap(review.style);
  els.mainTakeaway.textContent = review.takeaway;
  els.cleanSummary.textContent = review.summary;

  // Themes
  els.themeChips.innerHTML = "";
  review.themes.forEach(t => {
    const chip = document.createElement("span");
    chip.className = `chip ${t.toLowerCase()}`;
    chip.textContent = cap(t);
    els.themeChips.appendChild(chip);
  });

  // Lists
  renderList(els.nextSteps, review.nextSteps, "ol");
  renderList(els.risksList, review.risks, "ul");
  renderList(els.questionsList, review.questions, "ul");

  // Buckets
  els.bucketGrid.innerHTML = "";
  Object.entries(review.buckets).forEach(([name, values]) => {
    if (!values.length) return;
    const b = document.createElement("div");
    b.className = "bucket";
    b.innerHTML = `<strong>${name}</strong><p>${values.join(" · ")}</p>`;
    els.bucketGrid.appendChild(b);
  });

  if (!els.bucketGrid.children.length) {
    els.bucketGrid.innerHTML = `<p style="color:var(--muted);font-size:13px">Nothing specific to extract.</p>`;
  }
}

function renderList(container, items, type) {
  container.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "Nothing to note here.";
    li.style.color = "var(--muted)";
    container.appendChild(li);
    return;
  }
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

// ------------------------------------------------------------
// Save / history
// ------------------------------------------------------------
function saveReview() {
  if (!currentReview) return;
  if (reviews.find(r => r.id === currentReview.id)) {
    showToast("Already saved!"); return;
  }
  reviews.unshift(currentReview);
  reviews = reviews.slice(0, 30);
  persistReviews();
  updateCount();
  renderHistory();
  showToast("Review saved!");
}

function renderHistory() {
  els.historyList.innerHTML = "";

  if (!reviews.length) {
    els.historyWrap.hidden = true;
    return;
  }

  els.historyWrap.hidden = false;

  reviews.forEach(review => {
    const node = els.historyTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".hcard-type").textContent = review.type;
    node.querySelector("strong").textContent = review.title;
    node.querySelector("p").textContent = review.takeaway;
    node.querySelector(".hcard-main").addEventListener("click", () => loadReview(review.id));
    node.querySelector(".hcard-delete").addEventListener("click", () => deleteReview(review.id));
    els.historyList.appendChild(node);
  });
}

function loadReview(id) {
  const review = reviews.find(r => r.id === id);
  if (!review) return;
  currentReview = review;
  els.noteInput.value = review.rawNote;
  els.contextInput.value = review.context === "General" ? "" : review.context;
  els.styleInput.value = review.style;
  showResponse(review);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteReview(id) {
  if (!confirm("Delete this review?")) return;
  reviews = reviews.filter(r => r.id !== id);
  if (currentReview?.id === id) { currentReview = null; showEmpty(); }
  persistReviews();
  updateCount();
  renderHistory();
  showToast("Review deleted.");
}

function clearAllHistory() {
  if (!reviews.length) { showToast("Nothing to clear."); return; }
  if (!confirm("Clear all saved reviews?")) return;
  reviews = [];
  currentReview = null;
  persistReviews();
  updateCount();
  renderHistory();
  showEmpty();
  showToast("History cleared.");
}

function updateCount() {
  els.reviewCount.textContent = reviews.length;
}

// ------------------------------------------------------------
// Note controls
// ------------------------------------------------------------
function clearNote() {
  els.noteInput.value = "";
  els.contextInput.value = "";
  els.styleInput.value = "practical";
  currentReview = null;
  showEmpty();
}

function loadExample() {
  els.noteInput.value = "Ok so I have way too much on my plate right now. I need to finish the LifePilot app and get it ready to launch, also need to call my mom back, haven't done that in weeks. Work is stressing me out — my boss keeps adding stuff without removing anything. I want to start working out again but can't find the time. Also I owe my friend $200. Feel like I'm spinning plates and dropping all of them.";
  els.contextInput.value = "personal + work";
  els.styleInput.value = "coach";
}

// ------------------------------------------------------------
// Storage
// ------------------------------------------------------------
function loadReviews() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistReviews() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------
function uid() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
