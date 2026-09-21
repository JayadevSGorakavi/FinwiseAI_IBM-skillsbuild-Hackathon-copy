import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, PieChart, GraduationCap, Building2, TrendingUp, Wallet, Target } from "lucide-react";
import ChatBubble from "../components/ChatBubble";
import { formatCurrency, getScholarshipsForCountry, getLoansForCountry } from "../lib/countries";
import { getChatHistory, saveMessage } from "../lib/firebase";

const SUGGESTED_PROMPTS = [
  "Am I overspending on any category this month?",
  "What is my savings rate and how can I improve it?",
  "Can I afford a ₹5,000 purchase right now?",
  "Which expense category should I cut first?",
  "How close am I to hitting my financial goals?",
  "Give me a personalised monthly budget plan",
];

/* ─────────────────────────────────────────────────────────── */
/*  Intent Detection — only inject context for personal Qs    */
/* ─────────────────────────────────────────────────────────── */
const PERSONAL_KEYWORDS = [
  "my ", " i ", "i'", "i am", "i've", "i have",
  "spending", "spend", "spent", "expense", "expenses",
  "budget", "afford", "afford", "income", "salary",
  "save", "saving", "saved", "savings",
  "score", "health", "overspend", "overspending",
  "category", "categories", "food", "transport", "rent",
  "entertainment", "education", "healthcare",
  "goal", "goals", "loan", "scholarship",
  "remaining", "left", "balance", "how much",
  "can i", "should i", "do i", "am i",
];

function isPersonalQuery(message) {
  const lower = message.toLowerCase();
  return PERSONAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/* ─────────────────────────────────────────────────────────── */
/*  Build Full Financial Context (only sent when needed)       */
/* ─────────────────────────────────────────────────────────── */
function buildFullContext(profile, expenses = [], budget) {
  const sym = profile?.countryData?.symbol || "₹";
  const income = profile?.income || 0;
  const monthlyBudget = budget?.total || income;

  // Filter to current month only — matches MonthlyReview logic
  const currentMonth = new Date().toISOString().substring(0, 7);
  const monthlyExpenses = expenses.filter((e) => (e.date || "").startsWith(currentMonth));

  // Totals (current month only)
  const totalSpent = monthlyExpenses
    .filter((e) => e.type !== "saving")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalSaved = monthlyExpenses
    .filter((e) => e.type === "saving")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const incomeLeft = monthlyBudget - totalSpent - totalSaved;
  const savingsRate = income > 0 ? ((totalSaved / income) * 100).toFixed(1) : "0.0";

  // Category breakdown (expenses only, current month)
  const EXPENSE_CATS = ["Food", "Transport", "Rent", "Entertainment", "Education", "Healthcare", "Other"];
  const categoryBreakdown = EXPENSE_CATS.map((cat) => {
    const total = monthlyExpenses
      .filter((e) => e.type !== "saving" && e.category === cat)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { cat, total };
  }).filter((c) => c.total > 0);

  // Savings breakdown (current month)
  const SAVINGS_CATS = ["Emergency Fund", "Savings Account", "Investments", "Goal Saving", "Other"];
  const savingsBreakdown = SAVINGS_CATS.map((cat) => {
    const total = monthlyExpenses
      .filter((e) => e.type === "saving" && e.category === cat)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { cat, total };
  }).filter((c) => c.total > 0);

  // Budget allocations and targets
  const allocations = budget?.allocations || { Needs: 50, Wants: 30, Savings: 20 };
  const needsBudget = Math.round(monthlyBudget * (allocations.Needs / 100));
  const wantsBudget = Math.round(monthlyBudget * (allocations.Wants / 100));
  const savingsBudget = Math.round(monthlyBudget * (allocations.Savings / 100));

  // Recent transactions for current month (last 7, no IDs)
  const recentTxns = [...monthlyExpenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 7)
    .map((e) => `${e.date} | ${e.type === "saving" ? "SAVING" : "EXPENSE"} | ${e.category} | ${sym}${e.amount}${e.note ? ` (${e.note})` : ""}`);

  // Income sources
  const incomeSources = (budget?.incomeSources || [])
    .map((s) => `${s.label}: ${sym}${s.amount}`)
    .join(", ");

  return `
[USER FINANCIAL SNAPSHOT for ${currentMonth} — use this to give personalised, data-grounded advice]

PROFILE
  Name: ${profile?.name || "Student"}
  Course: ${profile?.course || "Unknown"} | Year: ${profile?.year || "Unknown"}
  University: ${profile?.university || "Unknown"}
  Country: ${profile?.countryData?.name || "India"} | Currency: ${sym}
  Financial Goals: ${(profile?.goals || []).join("; ") || "None set"}

INCOME & BUDGET
  Monthly Income: ${sym}${income.toLocaleString()}
  Income Sources: ${incomeSources || `${sym}${income} (allowance)`}
  Monthly Budget Limit: ${sym}${monthlyBudget.toLocaleString()}
  Budget Allocation: Needs ${allocations.Needs}% (${sym}${needsBudget}) | Wants ${allocations.Wants}% (${sym}${wantsBudget}) | Savings ${allocations.Savings}% (${sym}${savingsBudget})

${currentMonth} SUMMARY
  Total Spent: ${sym}${totalSpent.toLocaleString()}
  Actively Saved: ${sym}${totalSaved.toLocaleString()} (savings rate: ${savingsRate}%)
  Income Left: ${sym}${incomeLeft.toLocaleString()} ${incomeLeft < 0 ? "⚠️ OVER BUDGET" : ""}

EXPENSE CATEGORY BREAKDOWN (${currentMonth})
${categoryBreakdown.length > 0 ? categoryBreakdown.map((c) => `  ${c.cat}: ${sym}${c.total.toLocaleString()}`).join("\n") : "  No expenses recorded yet"}

SAVINGS BREAKDOWN (${currentMonth})
${savingsBreakdown.length > 0 ? savingsBreakdown.map((c) => `  ${c.cat}: ${sym}${c.total.toLocaleString()}`).join("\n") : "  No savings recorded yet"}

RECENT TRANSACTIONS (${currentMonth}, last 7)
${recentTxns.length > 0 ? recentTxns.map((t) => `  ${t}`).join("\n") : "  No transactions this month"}
[END SNAPSHOT]`.trim();
}

/* ─────────────────────────────────────────────────────────── */
/*  Sanitize AI reply — fix broken ₹ symbol rendering          */
/*  Groq sometimes outputs the rupee sign as a Unicode escape  */
/*  (\u20b9), as the HTML entity (&#x20B9; / &amp;#8377;),    */
/*  or as mojibake diamond characters (◆◆◆ / ♦♦♦) when the   */
/*  UTF-8 byte sequence 0xE2 0x82 0xB9 gets mis-decoded.       */
/* ─────────────────────────────────────────────────────────── */
function sanitizeReply(text) {
  if (!text) return text;
  return text
    // Unicode escape literal in the string
    .replace(/\\u20[Bb]9/g, "₹")
    // HTML entities
    .replace(/&#x20[Bb]9;/gi, "₹")
    .replace(/&#8377;/g, "₹")
    .replace(/&amp;#8377;/g, "₹")
    // Mojibake: the 3-byte UTF-8 sequence for ₹ decoded as Latin-1
    // shows up as â\u0082¹ or similar; cover the common patterns
    .replace(/â\u0082¹/g, "₹")
    .replace(/â€š¹/g, "₹")
    // Diamond replacement characters that browsers show for bad bytes
    .replace(/[◆♦\uFFFD]{1,3}(?=\d)/g, "₹")
    // Rs. / INR shorthand the model sometimes uses instead
    .replace(/\bRs\.?\s*/g, "₹")
    .replace(/\bINR\s+(?=[\d,])/g, "₹");
}

function generateClientFallback(query, profile, expenses = [], budget) {
  const msg = (query || "").toLowerCase();
  const symbol = profile?.countryData?.symbol || "₹";
  const income = profile?.income || 15000;
  const country = profile?.countryData?.name || "your country";
  const course = profile?.course || "your course";
  const totalSpent = expenses.filter(e => e.type !== "saving").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalSaved = expenses.filter(e => e.type === "saving").reduce((s, e) => s + (Number(e.amount) || 0), 0);

  if (msg.includes("laptop") || msg.includes("afford") || msg.includes("buy")) {
    const recommended = Math.round(income * 2.5);
    return `Based on your monthly income of ${symbol}${income.toLocaleString()}, buying a student laptop around ${symbol}${recommended.toLocaleString()} to ${symbol}${(recommended * 1.5).toLocaleString()} is feasible if you save 20% (${symbol}${Math.round(income * 0.2).toLocaleString()}/month) for 6–8 months or check student developer discounts.`;
  }

  if (msg.includes("overspending") || msg.includes("spending") || msg.includes("expenses")) {
    const topExpense = [...expenses].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    if (topExpense) {
      return `You have spent ${symbol}${totalSpent.toLocaleString()} so far. Your highest expense category is **${topExpense.category}** (${symbol}${topExpense.amount.toLocaleString()}). Try capping discretionary outings to save 15–20% more each month.`;
    }
    return `Your recorded expenses total ${symbol}${totalSpent.toLocaleString()} against an income of ${symbol}${income.toLocaleString()}. Following the 50/30/20 rule, keep non-essential 'Wants' under ${symbol}${Math.round(income * 0.3).toLocaleString()}.`;
  }

  if (msg.includes("loan") || msg.includes("interest") || msg.includes("debt")) {
    return `For students studying ${course} in ${country}, government education loan schemes provide subsidized interest rates during study moratoriums. Aim to keep future monthly repayments under 20% of your projected entry salary.`;
  }

  if (msg.includes("scholarship") || msg.includes("grant")) {
    return `Top scholarship opportunities in ${country} prioritize merit, STEM/humanities majors, and need-based applicants. Applying 2–3 months prior to semester deadlines increases acceptance rates significantly.`;
  }

  if (msg.includes("emergency") || msg.includes("save")) {
    const target = Math.round(income * 2.5);
    return `Target an emergency cushion of 2 to 3 months of basic expenses (~${symbol}${target.toLocaleString()}). Setting aside ${symbol}${Math.round(income * 0.15).toLocaleString()} monthly into a dedicated savings account will build this safely before graduation.`;
  }

  if (msg.includes("score") || msg.includes("health")) {
    const score = Math.min(95, Math.max(50, Math.round(((income - totalSpent) / (income || 1)) * 50 + 40)));
    return `Your calculated Financial Health Score is around **${score}/100**. Maintaining your essential spending below 50% and keeping an active savings rate will raise your score towards Grade A.`;
  }

  return `Based on your profile as a ${course} student in ${country} with a monthly income of ${symbol}${income.toLocaleString()}, I recommend keeping essentials under ${symbol}${Math.round(income * 0.5).toLocaleString()} (50%) and building your emergency buffer. What specific area (budget, loans, or scholarships) would you like help with?`;
}

export default function ChatPage({ user, profile, expenses = [], budget }) {
  const countryCode = profile?.country || "IN";
  const currencySymbol = profile?.countryData?.symbol || "₹";
  const activeUid = user?.uid || "guest_user";

  // ── Live stats for right panel (current month only, consistent with Monthly Review) ──
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const currentMonthExpenses = expenses.filter((e) => (e.date || "").startsWith(currentMonthStr));

  const totalSpent = currentMonthExpenses
    .filter((e) => e.type !== "saving")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalSaved = currentMonthExpenses
    .filter((e) => e.type === "saving")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthlyBudget = budget?.total || profile?.income || 0;
  const remaining = monthlyBudget - totalSpent - totalSaved;
  const savingsRate = profile?.income > 0
    ? ((totalSaved / profile.income) * 100).toFixed(1)
    : "0.0";
  const topCategoryEntry = Object.entries(
    currentMonthExpenses
      .filter((e) => e.type !== "saving")
      .reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0); return acc; }, {})
  ).sort((a, b) => b[1] - a[1])[0];


  const defaultGreeting = {
    role: "bot",
    content: `Hello ${profile?.name || "there"}! I'm FinBot, your AI financial mentor. I have access to your spending data, budget, and goals — ask me anything personal like "Am I overspending?" or "Can I afford this?", or ask general questions like "What is compound interest?". How can I help?`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    model: "groq-ai",
  };

  const [messages, setMessages] = useState([defaultGreeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastContextUsed, setLastContextUsed] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const history = await getChatHistory(activeUid);
        if (history && history.length > 0) {
          setMessages(history);
        } else {
          setMessages([defaultGreeting]);
        }
      } catch (err) {
        console.warn("Could not load chat history:", err);
      }
    }
    loadHistory();
  }, [activeUid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (textToSend) => {
    const queryText = (typeof textToSend === "string" ? textToSend : input).trim();
    if (!queryText || loading) return;

    const userMsg = {
      role: "user",
      content: queryText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try { await saveMessage(activeUid, userMsg); } catch (_) {}

    // ── Smart Context Injection ──────────────────────────────
    // Only attach the user's financial snapshot when the question
    // is clearly personal — general/educational questions get none.
    const personal = isPersonalQuery(queryText);
    setLastContextUsed(personal);

    const baseSystemPrompt =
      `You are FinBot, a warm and friendly financial advisor for college students in ${
        profile?.countryData?.name || "India"
      }. Always reference amounts in ${currencySymbol} (${
        profile?.currency || "INR"
      }).

TONE & FORMAT RULES — follow these strictly:
- Write like a knowledgeable friend giving advice, NOT like a financial report.
- Use natural, flowing sentences. NEVER use markdown tables (no pipe characters).
- Keep responses under 180 words unless the question genuinely needs more detail.
- You may use a short bullet list (max 4 items) only when listing distinct action steps.
- Lead with the key insight or direct answer first, then explain briefly.
- Weave numbers into sentences naturally (e.g. "You've spent ₹3,450 on food — that's about half your total spend this month.").
- End with one encouraging line or a single clear next step.
- Never use section headers like ## or pipe tables like | col |.` +
      (personal
        ? "\n\nThe user's live financial data is embedded below — use it to give grounded, specific, personalised advice. Cite actual numbers conversationally."
        : "\n\nAnswer clearly and concisely.");

    const systemPrompt = personal
      ? `${baseSystemPrompt}\n\n${buildFullContext(profile, expenses, budget)}`
      : baseSystemPrompt;


    try {
      const res = await fetch("/api/finbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: queryText,
          systemPrompt,
          history: messages.slice(-8), // last 4 exchanges for conversational memory
        }),
      });

      // A crashed/missing serverless function returns an HTML error page, not
      // JSON. Read it as text first so the real cause lands in the console
      // instead of being swallowed as a generic "offline".
      const rawBody = await res.text();
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new Error(`/api/finbot returned ${res.status} (non-JSON): ${rawBody.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(`/api/finbot returned ${res.status}: ${data.error || rawBody.slice(0, 200)}`);
      if (data._reason) console.warn("FinBot is answering with a stub:", data._reason);

      const botMsg = {
        role: "bot",
        content: sanitizeReply(data.reply) || generateClientFallback(queryText, profile, expenses, budget),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: data.model || "groq-ai",
        contextUsed: personal,
      };
      setMessages((prev) => [...prev, botMsg]);
      await saveMessage(activeUid, botMsg);
    } catch (err) {
      console.error("FinBot API call failed — using local fallback:", err);
      const fallbackReply = generateClientFallback(queryText, profile, expenses, budget);
      const fallbackMsg = {
        role: "bot",
        content: sanitizeReply(fallbackReply),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: "demo (offline)",
        contextUsed: personal,
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      await saveMessage(activeUid, fallbackMsg);
    } finally {
      setLoading(false);
    }
  };

  const topScholarships = getScholarshipsForCountry(countryCode).slice(0, 2);
  const topLoans = getLoansForCountry(countryCode).slice(0, 2);

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden bg-bg">
      {/* ── Left Chat Panel ──────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0 border-r border-border bg-bg overflow-hidden">
        {/* Chat Messages List (Scrollable Area) */}
        <div className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto space-y-4 scroll-smooth">
          {messages.map((msg, index) => (
            <ChatBubble key={index} message={msg} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-textSecondary p-2 bg-surface/50 rounded-xl border border-border/50 w-fit animate-pulse">
              <Sparkles size={14} className="animate-spin text-primary" />
              <span>
                {lastContextUsed
                  ? "FinBot is analysing your personal finances..."
                  : "FinBot is thinking..."}
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompt Chips (Fixed Above Input) */}
        <div className="px-4 py-2 border-t border-border/40 overflow-x-auto flex gap-2 no-scrollbar bg-surface/30 shrink-0">
          {SUGGESTED_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              className="text-xs bg-surface border border-border px-3 py-1.5 rounded-full text-textSecondary hover:text-textPrimary hover:border-primary/50 whitespace-nowrap transition-all shadow-sm"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Form (Fixed at Bottom) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 border-t border-border bg-surface flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about your finances or anything financial...`}
            className="input-field flex-1 text-xs sm:text-sm py-2.5"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary p-2.5 sm:p-3 rounded-xl flex items-center justify-center disabled:opacity-50 shadow-md shadow-primary/20 shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* ── Right Dynamic Context Panel ──────────────────── */}
      <div className="w-72 p-4 md:p-5 bg-surface border-t md:border-t-0 border-border overflow-y-auto space-y-5 hidden lg:block flex-shrink-0 h-full min-h-0">

        {/* Live Financial Snapshot */}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-textSecondary uppercase tracking-wider mb-3">
            <TrendingUp size={13} className="text-accent" />
            <span>Your Financial Snapshot</span>
          </div>
          <div className="glass rounded-xl border border-border overflow-hidden text-xs">
            {/* Income vs Spent bar */}
            <div className="p-3 border-b border-border/50 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-textSecondary">Spent this month</span>
                <span className={`font-bold ${
                  totalSpent > monthlyBudget ? "text-danger" : "text-textPrimary"
                }`}>{formatCurrency(totalSpent, countryCode)}</span>
              </div>
              {monthlyBudget > 0 && (
                <div className="w-full bg-border/40 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      (totalSpent + totalSaved) > monthlyBudget ? "bg-danger" :
                      (totalSpent + totalSaved) > monthlyBudget * 0.8 ? "bg-warning" : "bg-primary"
                    }`}
                    style={{ width: `${Math.min(100, (((totalSpent + totalSaved) / monthlyBudget) * 100))}%` }}
                  />
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-textSecondary">Income Left</span>
                <span className={`font-semibold ${
                  remaining >= 0 ? "text-accent" : "text-danger"
                }`}>{remaining >= 0 ? formatCurrency(remaining, countryCode) : `-${formatCurrency(Math.abs(remaining), countryCode)}`}</span>
              </div>
            </div>

            {/* Savings */}
            <div className="p-3 border-b border-border/50 flex justify-between">
              <div className="flex items-center gap-1.5">
                <Wallet size={11} className="text-accent" />
                <span className="text-textSecondary">Saved</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-accent">{formatCurrency(totalSaved, countryCode)}</span>
                <span className="text-[10px] text-textSecondary ml-1">({savingsRate}%)</span>
              </div>
            </div>

            {/* Top spending category */}
            <div className="p-3 border-b border-border/50 flex justify-between">
              <div className="flex items-center gap-1.5">
                <PieChart size={11} className="text-warning" />
                <span className="text-textSecondary">Top spend</span>
              </div>
              <span className="font-semibold text-textPrimary">
                {topCategoryEntry ? `${topCategoryEntry[0]} (${formatCurrency(topCategoryEntry[1], countryCode)})` : "—"}
              </span>
            </div>

            {/* Goals */}
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target size={11} className="text-primary" />
                <span className="text-textSecondary">Goals</span>
              </div>
              {(profile?.goals || []).length > 0 ? (
                <ul className="space-y-0.5">
                  {(profile.goals || []).map((g, i) => (
                    <li key={i} className="text-[10px] text-textPrimary truncate">• {g}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-textSecondary">No goals set yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Context Mode Indicator */}
        <div className="glass rounded-xl p-3 border border-border/50 text-[10px] text-textSecondary space-y-1">
          <p className="font-semibold text-textPrimary text-xs">🤖 Smart Context Mode</p>
          <p>Personal questions (spending, budget, goals) → FinBot sees your live data.</p>
          <p>General questions → no data sent, saving tokens.</p>
        </div>

        {/* Top Scholarships Quick Panel */}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider mb-3">
            <GraduationCap size={14} />
            <span>Scholarship Match</span>
          </div>
          <div className="space-y-2">
            {topScholarships.map((s) => (
              <div key={s.id} className="p-3 rounded-xl glass text-xs space-y-1">
                <p className="font-semibold text-textPrimary line-clamp-1">{s.name}</p>
                <p className="text-[10px] text-accent font-bold">{formatCurrency(s.amount, countryCode)} / yr</p>
              </div>
            ))}
          </div>
        </div>

        {/* Loan Quick Reference */}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-warning uppercase tracking-wider mb-3">
            <Building2 size={14} />
            <span>Country Loan Schemes</span>
          </div>
          <div className="space-y-2">
            {topLoans.map((l) => (
              <div key={l.id} className="p-3 rounded-xl glass text-xs space-y-1">
                <p className="font-semibold text-textPrimary line-clamp-1">{l.name}</p>
                <p className="text-[10px] text-textSecondary">{l.interestRate}% interest · {l.provider}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
