// LifePilot — app.js

const STORAGE_KEY = "lifepilot.reviews.v3";

// Storage first
function loadReviews() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistReviews() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

function uid() {
  return window.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(16).slice(2);
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function clean(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(x => x && typeof x === "string" && x.trim());
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

// State
let reviews = loadReviews();
let currentReview = null;
let isAnalyzing = false;

// DOM refs
const els = {
  reviewCount:     document.querySelector("#reviewCount"),
  noteInput:       document.querySelector("#noteInput"),
  contextInput:    document.querySelector("#contextInput"),
  styleInput:      document.querySelector("#styleInput"),
  analyzeButton:   document.querySelector("#analyzeButton"),
  freshButton:     document.querySelector("#freshButton"),
  exampleButton:   document.querySelector("#exampleButton"),
  btnText:         document.querySelector("#btnText"),
  emptyState:      document.querySelector("#emptyState"),
  thinkingState:   document.querySelector("#thinkingState"),
  pilotOutput:     document.querySelector("#pilotOutput"),
  styleTag:        document.querySelector("#styleTag"),
  mainTakeaway:    document.querySelector("#mainTakeaway"),
  cleanSummary:    document.querySelector("#cleanSummary"),
  themeChips:      document.querySelector("#themeChips"),
  nextSteps:       document.querySelector("#nextSteps"),
  risksList:       document.querySelector("#risksList"),
  questionsList:   document.querySelector("#questionsList"),
  bucketGrid:      document.querySelector("#bucketGrid"),
  saveButton:      document.querySelector("#saveButton"),
  clearHistory:    document.querySelector("#clearHistory"),
  historyList:     document.querySelector("#historyList"),
  historyWrap:     document.querySelector("#historyWrap"),
  historyTemplate: document.querySelector("#historyTemplate"),
  toast:           document.querySelector("#toast")
};

// Note controls
function clearNote() {
  els.noteInput.value = "";
  els.contextInput.value = "";
  els.styleInput.value = "practical";
  currentReview = null;
  showEmpty();
}

function loadExample() {
  els.noteInput.value = "Work is stressing me out — my boss keeps adding stuff without removing anything. I want to start working out again but can't find the time. Also I owe my friend $200. Feel like I'm spinning plates and dropping all of them.";
  els.contextInput.value = "personal + work";
  els.styleInput.value = "coach";
}

// State helpers
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

// AI call
async function callAI(rawNote, context, style) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: rawNote, style, context })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Server error " + response.status);
  }
  return response.json();
}

// Build review
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

// Analyze
async function analyzeNote() {
  if (isAnalyzing) return;
  const rawNote = els.noteInput.value.trim();
  if (!rawNote) { showToast("Write or paste some notes first."); return; }
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

// Render
function renderList(container, items) {
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

function showResponse(review) {
  els.thinkingState.hidden = true;
  els.emptyState.hidden = true;
  els.pilotOutput.hidden = false;
  els.styleTag.textContent = cap(review.style);
  els.mainTakeaway.textContent = review.takeaway;
  els.cleanSummary.textContent = review.summary;
  els.themeChips.innerHTML = "";
  review.themes.forEach(t => {
    const chip = document.createElement("span");
    chip.className = "chip " + t.toLowerCase();
    chip.textContent = cap(t);
    els.themeChips.appendChild(chip);
  });
  renderList(els.nextSteps, review.nextSteps);
  renderList(els.risksList, review.risks);
  renderList(els.questionsList, review.questions);
  els.bucketGrid.innerHTML = "";
  Object.entries(review.buckets).forEach(([name, values]) => {
    if (!values.length) return;
    const b = document.createElement("div");
    b.className = "bucket";
    b.innerHTML = "<strong>" + name + "</strong><p>" + values.join(" · ") + "</p>";
    els.bucketGrid.appendChild(b);
  });
  if (!els.bucketGrid.children.length) {
    els.bucketGrid.innerHTML = "<p style='color:var(--muted);font-size:13px'>Nothing specific to extract.</p>";
  }
}

// Save / history
function saveReview() {
  if (!currentReview) return;
  if (reviews.find(r => r.id === currentReview.id)) { showToast("Already saved!"); return; }
  reviews.unshift(currentReview);
  reviews = reviews.slice(0, 30);
  persistReviews();
  updateCount();
  renderHistory();
  showToast("Review saved!");
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!reviews.length) { els.historyWrap.hidden = true; return; }
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

// Init — always last
function init() {
  els.analyzeButton.addEventListener("click", analyzeNote);
  els.freshButton.addEventListener("click", clearNote);
  els.exampleButton.addEventListener("click", loadExample);
  els.saveButton.addEventListener("click", saveReview);
  els.clearHistory.addEventListener("click", clearAllHistory);
  updateCount();
  renderHistory();
}

init();
