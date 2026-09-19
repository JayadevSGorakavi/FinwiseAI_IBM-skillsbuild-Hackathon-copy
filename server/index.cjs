/**
 * FinWise AI — Express backend
 *
 * Endpoints:
 *   POST /api/finbot        — Groq / IBM watsonx.ai Granite chat (FinBot)
 *   POST /api/health-score  — AI Financial Health Score (0-100)
 *   POST /api/advise        — legacy compatibility stub
 *   GET  /api/health        — health check
 */

const express = require("express");
const cors    = require("cors");
const https   = require("https");
const http    = require("http");
const fs      = require("fs");
const path    = require("path");

// Load .env if present (development)
try {
  const dotenv = require("dotenv");
  dotenv.config({ path: path.join(__dirname, "../.env") });
} catch (_) { /* dotenv optional */ }

const app = express();
app.use(express.json({ limit: "1mb" }));

// Robust CORS setup for Vercel <-> Render communication
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/* ─────────────────────────────────────────────────────────── */
/*  Serve built frontend from /dist                            */
/*  This makes `node server/index.cjs` serve BOTH the React   */
/*  app AND the /api endpoints from the same port (3001).     */
/*  API routes below take priority over static files.         */
/* ─────────────────────────────────────────────────────────── */
const DIST_DIR = path.join(__dirname, "../dist");
const distExists = fs.existsSync(DIST_DIR);
if (distExists) {
  app.use(express.static(DIST_DIR));
  console.log(`📁 Serving static frontend from ${DIST_DIR}`);
}

/* ─────────────────────────────────────────────────────────── */
/*  IBM watsonx.ai helper                                     */
/* ─────────────────────────────────────────────────────────── */
const WATSONX_URL        = process.env.WATSONX_URL        || "https://us-south.ml.cloud.ibm.com";
const WATSONX_API_KEY    = process.env.WATSONX_API_KEY    || "";
const WATSONX_PROJECT_ID = process.env.WATSONX_PROJECT_ID || "";

let ibmAccessToken = null;
let ibmTokenExpiry = 0;

async function getIBMToken() {
  if (ibmAccessToken && Date.now() < ibmTokenExpiry) return ibmAccessToken;
  if (!WATSONX_API_KEY) return null;

  return new Promise((resolve) => {
    const body = `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(WATSONX_API_KEY)}`;
    const options = {
      hostname: "iam.cloud.ibm.com",
      path: "/identity/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          ibmAccessToken = json.access_token;
          ibmTokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
          resolve(ibmAccessToken);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}

async function callGranite(systemPrompt, userMessage, maxTokens = 800) {
  const token = await getIBMToken();
  if (!token || !WATSONX_PROJECT_ID) return null;

  const payload = JSON.stringify({
    model_id: "ibm/granite-13b-chat-v2",
    input: `<|system|>\n${systemPrompt}\n<|user|>\n${userMessage}\n<|assistant|>`,
    parameters: {
      decoding_method: "greedy",
      max_new_tokens:  maxTokens,
      min_new_tokens:  10,
      repetition_penalty: 1.1,
      stop_sequences: ["<|user|>", "<|endoftext|>"],
    },
    project_id: WATSONX_PROJECT_ID,
  });

  const urlObj = new URL(`${WATSONX_URL}/ml/v1/text/generation?version=2023-05-29`);

  return new Promise((resolve) => {
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   "POST",
      headers:  {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          const text = json.results?.[0]?.generated_text?.trim() || null;
          resolve(text);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

/* ─────────────────────────────────────────────────────────── */
/*  Groq / Grok API helper                                     */
/* ─────────────────────────────────────────────────────────── */
function makeGroqSingleRequest(apiKey, model, systemPrompt, userMessage, maxTokens = 800) {
  const payload = JSON.stringify({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    max_tokens: maxTokens
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          const text = json.choices?.[0]?.message?.content?.trim() || null;
          resolve(text);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

async function callGroq(systemPrompt, userMessage, maxTokens = 800) {
  const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
  if (!apiKey) return null;

  const models = [
    "openai/gpt-oss-120b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768"
  ];

  for (const model of models) {
    const res = await makeGroqSingleRequest(apiKey, model, systemPrompt, userMessage, maxTokens);
    if (res) return res;
  }

  return null;
}

async function getGroundedExplanation(systemPrompt, userMessage, maxTokens = 800) {
  return await callGroq(systemPrompt, userMessage, maxTokens);
}

/* ─────────────────────────────────────────────────────────── */
/*  POST /api/finbot                                           */
/*  Main FinBot chat endpoint                                  */
/* ─────────────────────────────────────────────────────────── */
const FINBOT_STUB_RESPONSES = [
  "That's a great question! Based on your budget, I'd suggest reviewing your top spending categories first. Students often find the most savings in food and entertainment expenses.",
  "Looking at typical student finances, I recommend following the 50/30/20 rule — 50% for needs, 30% for wants, and 20% for savings. Start small and build consistency.",
  "For scholarship opportunities in your region, make sure to check the national portal regularly and set up alerts for deadlines. Early applications always have a better success rate!",
  "When considering a student loan, calculate your debt-to-income ratio first. A good rule of thumb: your total loan repayments shouldn't exceed 20% of your expected first-year salary.",
  "Building an emergency fund is your first financial priority as a student — aim for 1-3 months of expenses. Keep it in a high-yield savings account for easy access.",
];

app.post("/api/finbot", async (req, res) => {
  const { message, systemPrompt, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: "message is required" });

  const sysPrompt = systemPrompt || `You are FinBot, a friendly financial advisor for college students. 
Give concise, actionable advice in plain English. Be encouraging but honest. 
Keep responses under 200 words.`;

  let contextPrompt = sysPrompt;
  if (history.length > 0) {
    const recentHistory = history.slice(-6);
    contextPrompt += "\n\nConversation so far:";
    recentHistory.forEach(h => {
      contextPrompt += `\n${h.role === "user" ? "Student" : "FinBot"}: ${h.content}`;
    });
  }

  try {
    const groqResponse = await callGroq(contextPrompt, message, 600);

    if (groqResponse) {
      return res.json({ reply: groqResponse, model: "openai/gpt-oss-120b", _real: true });
    }

    if (WATSONX_API_KEY && WATSONX_PROJECT_ID) {
      const graniteResponse = await callGranite(contextPrompt, message, 600);
      if (graniteResponse) {
        return res.json({ reply: graniteResponse, model: "ibm/granite-13b-chat-v2", _real: true });
      }
    }

    const stub = FINBOT_STUB_RESPONSES[Math.floor(Math.random() * FINBOT_STUB_RESPONSES.length)];
    res.json({ reply: stub, model: "demo", _stub: true });
  } catch (err) {
    const stub = FINBOT_STUB_RESPONSES[0];
    res.json({ reply: stub, model: "demo", _stub: true });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  POST /api/health-score                                     */
/*  IBM AI Financial Health Score 0-100                        */
/* ─────────────────────────────────────────────────────────── */
app.post("/api/health-score", async (req, res) => {
  const { profile, expenses, budget } = req.body || {};

  const country     = profile?.country  || "India";
  const currency    = profile?.currency || "INR";
  const income      = profile?.income   || 0;
  const totalSpent  = (expenses || []).filter(e => e.type !== "saving").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalSaved  = (expenses || []).filter(e => e.type === "saving").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthlyBudget = budget?.total || income;
  const incomeLeft  = monthlyBudget - totalSpent - totalSaved;

  const systemPrompt = `You are a financial health analyst for students. 
Calculate the financial health score based ONLY on two components: Budget Adherence (50 points) and Goal Alignment (50 points).

Respond ONLY with a JSON object in this exact format:
{
  "score": <number 0-100>,
  "grade": "<A|B|C|D>",
  "summary": "<1 sentence>",
  "tips": ["<tip1>", "<tip2>", "<tip3>"],
  "subScores": {
    "budget": <number 0-50>,
    "goals": <number 0-50>
  },
  "improvements": [
    { "points": 5, "action": "<concrete action to do>", "why": "<why it helps your score>" },
    { "points": 10, "action": "<concrete action to do>", "why": "<why it helps your score>" },
    { "points": 15, "action": "<concrete action to do>", "why": "<why it helps your score>" }
  ]
}

Score guidelines:
- 80-100 (A): Excellent — spending <= budget, strongly aligns with student goals
- 60-79 (B): Good — spending close to budget limit, mostly aligns with goals
- 40-59 (C): Fair — over budget in several categories, poor alignment with goals
- 0-39 (D): Needs help — severe overspending, does not align with goals

Allocate subScores out of 100 total points:
- budget: up to 50 points (spending below or equal to monthly budget = higher score)
- goals: up to 50 points (how well spending aligns with student onboarding goals = higher score)`;

  const userMessage = `Student profile:
Country: ${country}
Currency: ${currency}
Monthly Income: ${income} ${currency}
Total Spent This Month: ${totalSpent} ${currency}
Actively Saved This Month: ${totalSaved} ${currency}
Income Left: ${incomeLeft} ${currency}
Monthly Budget: ${monthlyBudget} ${currency}
Goals: ${(profile?.goals || []).join(", ") || "Not set"}

Calculate financial health score, subScores (budget & goals out of 50 each), and give 3 Grok AI improvement tips worth 5, 10, and 15 points.`;

  try {
    const groqResponse = await callGroq(systemPrompt, userMessage, 500);

    if (groqResponse) {
      const jsonMatch = groqResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          return res.json({ ...data, _real: true });
        } catch (_) {}
      }
    }

    let budgetSub = 50;
    const totalAllocated = totalSpent + totalSaved;
    if (totalAllocated > monthlyBudget) {
      const overPct = (totalAllocated - monthlyBudget) / (monthlyBudget || 1);
      budgetSub = Math.max(0, Math.round(50 - (overPct * 50)));
    } else {
      const remainingPct = monthlyBudget > 0 ? (monthlyBudget - totalAllocated) / monthlyBudget : 0;
      budgetSub = Math.max(20, Math.min(50, Math.round(20 + (remainingPct * 30))));
    }

    const goalsSub = (profile?.goals && profile.goals.length > 0) ? 38 : 25;
    const score = Math.round(Math.min(100, Math.max(0, budgetSub + goalsSub)));
    const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";

    const tipsPrompt = `You are a financial advisor for students. The student's financial health score is ${score}/100 (grade ${grade}).
Monthly income: ${income} ${currency}, total spent: ${totalSpent} ${currency}, budget: ${monthlyBudget} ${currency}.
Goals: ${(profile?.goals || []).join(", ") || "Not set"}.

Return ONLY a JSON array of exactly 3 improvement objects, no other text:
[
  { "points": 5,  "action": "<short action>", "why": "<why it helps>" },
  { "points": 10, "action": "<short action>", "why": "<why it helps>" },
  { "points": 15, "action": "<short action>", "why": "<why it helps>" }
]`;

    let improvements = null;
    const tipsResponse = await callGroq(tipsPrompt, "Give 3 personalised score improvement tips.", 300);
    if (tipsResponse) {
      const arrMatch = tipsResponse.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { improvements = JSON.parse(arrMatch[0]); } catch (_) {}
      }
    }

    if (!improvements || !Array.isArray(improvements)) {
      const overBudget = totalSpent > monthlyBudget;
      improvements = [
        {
          points: 5,
          action: overBudget
            ? `Reduce daily spending by ${Math.round((totalSpent - monthlyBudget) / 30)} ${currency}`
            : "Log all micro-purchases to spot spending patterns",
          why: "Small consistent savings add up to significant budget adherence improvements"
        },
        {
          points: 10,
          action: profile?.goals?.length > 0
            ? `Allocate a fixed amount toward "${profile.goals[0]}" each payday`
            : "Set up an automatic monthly savings transfer of 10% of income",
          why: "Automating savings ensures goal alignment even in high-spend months"
        },
        {
          points: 15,
          action: "Keep total monthly spending at or below your budget limit",
          why: `Spending ${monthlyBudget} ${currency} or less maximises your budget adherence score`
        }
      ];
    }

    res.json({
      score,
      grade,
      summary: `Your financial health score is ${score}/100 — ${grade === "A" ? "excellent work!" : grade === "B" ? "good progress!" : "room for improvement."}`,
      tips: [
        "Track every expense, even small ones — they add up fast",
        "Save before you spend by allocating 20% on payday",
        "Review your non-essential categories weekly",
      ],
      subScores: { budget: budgetSub, goals: goalsSub },
      improvements,
      _stub: true,
    });
  } catch {
    res.json({
      score: 70,
      grade: "B",
      summary: "Good progress on your financial journey!",
      tips: ["Track expenses daily", "Save before you spend", "Review your budget weekly"],
      subScores: { budget: 35, goals: 35 },
      improvements: [
        { points: 5,  action: "Track all daily micro-purchases",                 why: "Identifies hidden spending leakage" },
        { points: 10, action: "Automate savings transfers each payday",             why: "Ensures consistent savings rate" },
        { points: 15, action: "Keep total spending within monthly budget limit",    why: "Directly maximises budget adherence score" }
      ],
      _stub: true
    });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  POST /api/monthly-review                                   */
/*  IBM AI Monthly Goal Alignment & Review                    */
/* ─────────────────────────────────────────────────────────── */
app.post("/api/monthly-review", async (req, res) => {
  const { profile, expenses, budget } = req.body || {};

  const country     = profile?.country  || "India";
  const currency    = profile?.currency || "INR";
  const income      = profile?.income   || 0;
  const totalSpent  = (expenses || []).filter(e => e.type !== "saving").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalSaved  = (expenses || []).filter(e => e.type === "saving").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthlyBudget = budget?.total || income;
  const incomeLeft  = monthlyBudget - totalSpent - totalSaved;
  const goals       = profile?.goals || [];

  const categoryTotals = {};
  (expenses || []).forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + (e.amount || 0);
  });

  const systemPrompt = `You are a student financial advisor. Compare this student's actual monthly performance vs their onboarding goals.
Respond ONLY with a JSON object in this exact format:
{
  "goalAlignments": [
    { "goal": "<name of goal>", "status": "<on-track|needs-focus>", "message": "<1-2 sentence comparison explaining why against actual spending data>" }
  ],
  "overallVerdict": "<2-sentence encouraging summary of the month>",
  "nextMonthFocus": "<1 actionable focal point for next month>"
}`;

  const userMessage = `Student profile:
Country: ${country}
Currency: ${currency}
Monthly Income: ${income} ${currency}
Monthly Budget Limit: ${monthlyBudget} ${currency}
Total Spent: ${totalSpent} ${currency}
Actively Saved: ${totalSaved} ${currency}
Income Left: ${incomeLeft} ${currency}
Category Breakdown: ${JSON.stringify(categoryTotals)}
Goals to track: ${JSON.stringify(goals)}

Provide goal alignment feedback based on this data.`;

  try {
    const groqResponse = await callGroq(systemPrompt, userMessage, 500);

    if (groqResponse) {
      const jsonMatch = groqResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return res.json({ ...data, _real: true });
      }
    }

    const goalAlignments = goals.map(g => {
      const isSavingGoal = g.toLowerCase().includes("save") || g.toLowerCase().includes("fund");
      const status = isSavingGoal ? (totalSaved > 0 ? "on-track" : "needs-focus") : "on-track";
      const message = isSavingGoal
        ? (totalSaved > 0
            ? `You actively saved ${totalSaved} ${currency} this month. Keep it up to build your savings habit.`
            : `No savings were recorded this month. Transfer a portion of your income to hit your savings goal.`)
        : `Track your day-to-day spending on wants to stay aligned with your goal: "${g}".`;
      return { goal: g, status, message };
    });

    res.json({
      goalAlignments,
      overallVerdict: `You spent ${totalSpent} ${currency} and actively saved ${totalSaved} ${currency} out of your ${income} ${currency} income, leaving ${incomeLeft} ${currency} as unspent income.`,
      nextMonthFocus: "Try to keep your non-essential categories below 30% of total spending and log your savings transfers early.",
      _stub: true
    });
  } catch {
    const goalAlignments = goals.map(g => ({
      goal: g,
      status: "on-track",
      message: "Keep monitoring your expenses to stay aligned."
    }));
    res.json({
      goalAlignments,
      overallVerdict: "Your overall spending is stable. Continue tracking daily.",
      nextMonthFocus: "Review your wants categories weekly.",
      _stub: true
    });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  POST /api/advise  (legacy compatibility)                   */
/* ─────────────────────────────────────────────────────────── */
app.post("/api/advise", async (req, res) => {
  const { ruleCode = "", facts = {} } = req.body || {};
  const country  = facts.country  || "your country";
  const currency = facts.currency || "local currency";

  const systemPrompt = `You are FinBot, a financial advisor for students in ${country}. 
Give a brief explanation (2-3 sentences) about the financial rule being triggered, 
then a concrete example with numbers in ${currency}.
Format: {"explanation": "...", "example": "..."}`;

  const userMessage = `Explain this financial rule for a student: ${ruleCode.replace(/_/g, " ")}`;

  const ibmResponse = await getGroundedExplanation(systemPrompt, userMessage, 300);
  if (ibmResponse) {
    const jsonMatch = ibmResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0]);
        return res.json({ ...data, model: "openai/gpt-oss-120b", ruleCode, _real: true });
      } catch (_) {}
    }
    return res.json({ explanation: ibmResponse, example: null, model: "openai/gpt-oss-120b", ruleCode, _real: true });
  }

  res.json({
    explanation: "This financial pattern warrants attention. Review your budget and spending habits relative to your income.",
    example: null,
    model: "demo",
    ruleCode,
    _stub: true,
  });
});

/* ─────────────────────────────────────────────────────────── */
/*  POST /api/discover-scholarships                            */
/*  Live AI Discovery of Scholarships for country & course    */
/* ─────────────────────────────────────────────────────────── */
app.post("/api/discover-scholarships", async (req, res) => {
  const { country = "India", countryCode = "IN", course = "Engineering", university = "University" } = req.body || {};

  const systemPrompt = `You are a real-time scholarship crawler and advisor.
Discover 4 real, latest, active scholarships available for students in ${country} (${countryCode}) studying ${course} at ${university}.
Deadlines MUST be in late 2026 or 2027 (format YYYY-MM-DD).
Return ONLY a valid JSON array of objects with this EXACT structure (no other markdown or text):
[
  {
    "id": "ai-unique-slug",
    "name": "Full Official Scholarship Name",
    "provider": "Official Foundation / Government Ministry",
    "amount": 50000,
    "amountPerYear": true,
    "deadline": "2026-11-30",
    "type": "Merit",
    "field": "STEM",
    "description": "2 sentence clear summary of the grant benefits and coverage.",
    "eligibility": "Clear concise eligibility criteria.",
    "link": "https://official-portal-url"
  }
]`;

  const userMessage = `Find and return 4 latest verified scholarships for ${country} in 2026/2027.`;

  try {
    const response = await callGroq(systemPrompt, userMessage, 1000);
    if (response) {
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return res.json({ scholarships: parsed, _real: true });
      }
    }
    res.json({ scholarships: [], _stub: true });
  } catch (err) {
    console.error("AI scholarship discovery error:", err);
    res.json({ scholarships: [], _stub: true });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  POST /api/discover-loans                                   */
/*  Live AI Discovery of Student Loans & Subsidies            */
/* ─────────────────────────────────────────────────────────── */
app.post("/api/discover-loans", async (req, res) => {
  const { country = "India", countryCode = "IN", course = "Engineering", university = "University" } = req.body || {};

  const systemPrompt = `You are an educational financing and banking advisor.
Discover 3 latest verified student loan schemes or interest subsidy programs for students in ${country} (${countryCode}) studying ${course} at ${university}.
Return ONLY a valid JSON array of objects with this EXACT structure (no other markdown or text):
[
  {
    "id": "ai-loan-slug",
    "name": "Full Loan or Subsidy Scheme Name",
    "provider": "Bank or Government Department",
    "minAmount": 50000,
    "maxAmount": 2000000,
    "interestRate": 8.15,
    "tenure": 180,
    "description": "2 sentence clear description of loan features and moratorium terms.",
    "eligibility": "Eligibility criteria and co-borrower requirements.",
    "link": "https://official-bank-url"
  }
]`;

  const userMessage = `Find and return 3 latest loan schemes and government subsidies for ${country}.`;

  try {
    const response = await callGroq(systemPrompt, userMessage, 1000);
    if (response) {
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return res.json({ loans: parsed, _real: true });
      }
    }
    res.json({ loans: [], _stub: true });
  } catch (err) {
    console.error("AI loan discovery error:", err);
    res.json({ loans: [], _stub: true });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  POST /api/match-scholarships                               */
/*  Detailed Best Scholarships + How to Apply Guide           */
/* ─────────────────────────────────────────────────────────── */
app.post("/api/match-scholarships", async (req, res) => {
  const {
    country = "India",
    countryCode = "IN",
    course = "Computer Science & Engineering",
    university = "University",
    income = 15000,
    currencySymbol = "₹",
  } = req.body || {};

  const systemPrompt = `You are a premier university scholarship advisor.
Evaluate this student profile:
- Country: ${country} (${countryCode})
- Course: ${course}
- University: ${university}
- Monthly Student Income/Allowance: ${currencySymbol}${income}

Recommend the top 3 best matching scholarships for this specific degree and country, along with a concrete step-by-step "How to Apply" roadmap and required documents.

Return ONLY a valid JSON object in this EXACT structure (no other markdown or extra text):
{
  "bestScholarships": [
    {
      "name": "Official Scholarship Name",
      "provider": "Foundation or Government Body",
      "amount": "${currencySymbol}50,000 / yr",
      "deadline": "2026-10-31",
      "whyBest": "1-2 sentences explaining why this is the highest-probability, best-fitting scholarship for a ${course} student.",
      "link": "https://official-portal-url"
    }
  ],
  "howToApplySteps": [
    "Step 1: Register on the official portal...",
    "Step 2: Collect mandatory documents...",
    "Step 3: Submit application with personal statement..."
  ],
  "requiredDocuments": [
    "Class 10th & 12th Academic Transcripts",
    "Valid Family Income Certificate (below threshold)",
    "College Bonafide Student Certificate",
    "Bank Account Details (Aadhaar/Direct Deposit linked)"
  ]
}`;

  const userMessage = `Generate the best matching scholarships and step-by-step application instructions for a ${course} student in ${country}.`;

  try {
    const response = await callGroq(systemPrompt, userMessage, 1200);
    if (response) {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return res.json({ ...parsed, _real: true });
      }
    }
    res.json({
      bestScholarships: [
        {
          name: "Reliance Foundation Undergraduate Scholarship",
          provider: "Reliance Foundation",
          amount: `${currencySymbol}2,00,000`,
          deadline: "2026-10-15",
          whyBest: `Specifically awards up to ₹2 Lakhs for undergraduate degree students in ${course}, combining financial grant with leadership workshops.`,
          link: "https://www.scholarships.reliancefoundation.org/",
        },
        {
          name: "Central Sector Scheme (NSP)",
          provider: "Ministry of Education",
          amount: `${currencySymbol}20,000 / yr`,
          deadline: "2026-12-31",
          whyBest: "Direct Benefit Transfer (DBT) scheme with 80,000 fresh awards annually for top board exam scorers.",
          link: "https://scholarships.gov.in/",
        },
      ],
      howToApplySteps: [
        "1. Register on the official government/foundation scholarship portal with valid email and phone.",
        "2. Complete student profile details (enrollment number, university name, category).",
        "3. Upload attested copies of marksheets, income certificate, and college bonafide letter.",
        "4. Submit your application and ensure your college nodal officer verifies it before the deadline.",
      ],
      requiredDocuments: [
        "Class 10 & 12 Marksheets",
        "Family Income Certificate",
        "College Bonafide Student Certificate",
        "Bank Passbook (Aadhaar linked)",
      ],
      _stub: true,
    });
  } catch (err) {
    console.error("AI scholarship matching error:", err);
    res.json({
      bestScholarships: [],
      howToApplySteps: [],
      requiredDocuments: [],
      _stub: true,
    });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  GET / (Root API info page)                                 */
/* ─────────────────────────────────────────────────────────── */
app.get("/", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>FinWise AI Backend API</title>
        <style>
          body { background: #0B0B0D; color: #ECE7DD; font-family: sans-serif; padding: 40px; }
          a { color: #6C63FF; text-decoration: none; }
          .badge { background: #17171A; border: 1px solid #2A2A2E; padding: 4px 12px; border-radius: 20px; color: #00D9A3; }
          code { background: #17171A; padding: 2px 6px; border-radius: 4px; color: #6C63FF; }
        </style>
      </head>
      <body>
        <h1>🚀 FinWise AI Backend API Server</h1>
        <p><span class="badge">Status: Running</span></p>
        <p>This is the Express backend API for FinWise AI.</p>
        <h3>Available API Endpoints:</h3>
        <ul>
          <li><code>GET /api/health</code> — <a href="/api/health">Check Health JSON</a></li>
          <li><code>POST /api/finbot</code> — Groq / IBM watsonx Granite Chat</li>
          <li><code>POST /api/health-score</code> — AI Financial Health Score (0-100)</li>
        </ul>
      </body>
    </html>
  `);
});

/* ─────────────────────────────────────────────────────────── */
/*  GET /api/health                                            */
/* ─────────────────────────────────────────────────────────── */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    ibm_configured: !!(WATSONX_API_KEY && WATSONX_PROJECT_ID),
    groq_configured: !!process.env.GROQ_API_KEY,
  });
});

/* ─────────────────────────────────────────────────────────── */
/*  SPA Catch-all (must be LAST, after all /api routes)       */
/*  Serves index.html for React Router (client-side routing)  */
/* ─────────────────────────────────────────────────────────── */
if (distExists) {
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(DIST_DIR, "index.html"));
    }
  });
}

/* ─────────────────────────────────────────────────────────── */
/*  Startup                                                    */
/* ─────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 FinWise AI API running on http://${HOST}:${PORT}`);
  console.log(`   POST /api/finbot        — FinBot (Groq / IBM watsonx Granite)`);
  console.log(`   POST /api/health-score  — AI Financial Health Score`);
  console.log(`   POST /api/advise        — legacy compatibility`);
  console.log(`   GET  /api/health        — health check`);
  if (!process.env.GROQ_API_KEY && !WATSONX_API_KEY) {
    console.log(`\n⚠️  No API key set in .env — running in demo mode`);
  } else {
    console.log(`\n✅ Connected AI: ${process.env.GROQ_API_KEY ? "Groq (" + (process.env.GROQ_API_KEY.slice(0, 8)) + "...)" : "IBM watsonx"}\n`);
  }
});
