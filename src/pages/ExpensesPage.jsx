import { useState } from "react";
import { Plus, Trash2, PieChart as PieIcon, Sparkles, PiggyBank } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "../lib/countries";

const CATEGORIES = ["Food", "Transport", "Rent", "Entertainment", "Education", "Healthcare", "Other"];
const CATEGORY_COLORS = {
  Food: "#6C63FF",
  Transport: "#00D9A3",
  Rent: "#D4AF37",
  Entertainment: "#FF6584",
  Education: "#36A2EB",
  Healthcare: "#4BC0C0",
  Other: "#9966FF",
};

const SAVINGS_CATEGORIES = ["Emergency Fund", "Savings Account", "Investments", "Goal Saving", "Other"];
const SAVINGS_CATEGORY_COLORS = {
  "Emergency Fund": "#00D9A3",
  "Savings Account": "#36A2EB",
  "Investments": "#D4AF37",
  "Goal Saving": "#FF6584",
  "Other": "#9966FF",
};

export default function ExpensesPage({
  profile,
  expenses = [],
  setExpenses,
  budget,
  onAddExpense,
  onDeleteExpense,
}) {
  const countryCode = profile?.country || "IN";

  const [type, setType] = useState("expense"); // "expense" or "saving"
  const [category, setCategory] = useState("Food");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);

  const handleTypeChange = (newType) => {
    setType(newType);
    setCategory(newType === "saving" ? SAVINGS_CATEGORIES[0] : CATEGORIES[0]);
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    const newExpense = {
      id: Date.now().toString(),
      category,
      amount: Number(amount),
      date: date || new Date().toISOString().split("T")[0],
      note,
      type, // "expense" or "saving"
    };

    if (onAddExpense) {
      await onAddExpense(newExpense);
    } else if (setExpenses) {
      setExpenses([newExpense, ...expenses]);
    }

    setAmount("");
    setNote("");
  };

  const handleDeleteExpense = async (id) => {
    if (onDeleteExpense) {
      await onDeleteExpense(id);
    } else if (setExpenses) {
      setExpenses(expenses.filter((e) => e.id !== id));
    }
  };

  const currentMonthStr = new Date().toISOString().substring(0, 7);
  // Sync to current month (or latest month with transactions if current has none)
  const currentMonthExpenses = expenses.filter((e) => (e.date || "").startsWith(currentMonthStr));
  const activeMonthExpenses = currentMonthExpenses.length > 0
    ? currentMonthExpenses
    : expenses;

  // Group by category for pie chart (expenses + savings, current/latest month)
  const expenseSlices = CATEGORIES.map((cat) => {
    const value = activeMonthExpenses
      .filter((e) => e.type !== "saving" && e.category === cat)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { name: cat, value, color: CATEGORY_COLORS[cat] };
  }).filter((c) => c.value > 0);

  const savingsSlices = SAVINGS_CATEGORIES.map((cat) => {
    const value = activeMonthExpenses
      .filter((e) => e.type === "saving" && e.category === cat)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const label = cat === "Other" ? "Savings (Other)" : `${cat} (Saving)`;
    return {
      name: label,
      value,
      color: SAVINGS_CATEGORY_COLORS[cat] || "#10B981",
    };
  }).filter((c) => c.value > 0);

  const customSavings = activeMonthExpenses
    .filter((e) => e.type === "saving" && !SAVINGS_CATEGORIES.includes(e.category))
    .reduce((sum, e) => sum + Number(e.amount), 0);
  if (customSavings > 0) {
    savingsSlices.push({ name: "Savings", value: customSavings, color: "#10B981" });
  }

  const categoryData = [...expenseSlices, ...savingsSlices];

  const totalSpent = activeMonthExpenses
    .filter((e) => e.type !== "saving")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalSaved = activeMonthExpenses
    .filter((e) => e.type === "saving")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const handleGenerateSummary = async () => {
    setLoadingAi(true);
    try {
      const topCatEntry = categoryData.sort((a, b) => b.value - a.value)[0] || { name: "Food", value: 0 };
      const topCat = topCatEntry.name;
      const topVal = topCatEntry.value;
      const breakdownText = categoryData.map((c) => `${c.name}: ${formatCurrency(c.value, countryCode)}`).join(", ");
      const income = profile?.income || budget?.total || 15000;

      const detailedPrompt = `Perform a human-readable, data-grounded student expense audit for this month:
- Monthly Income / Allowance: ${formatCurrency(income, countryCode)}
- Total Spent: ${formatCurrency(totalSpent, countryCode)}
- Actively Saved: ${formatCurrency(totalSaved, countryCode)}
- Category Breakdown: ${breakdownText}
- Highest Spend Category: ${topCat} (${formatCurrency(topVal, countryCode)})

Respond in 3 concise, human, and direct points:
1. One clear observation about their spending patterns and health based on their actual numbers.
2. Step 1: An exact, practical action to optimize their top spending area (${topCat}), with specific target numbers or practical campus hacks.
3. Step 2: A concrete habit or cap to prevent leakage in their other categories.

Do NOT give generic clichés like "track expenses" or "stick to a budget". Be friendly, sharp, and specific.`;

      const res = await fetch("/api/finbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: detailedPrompt,
          systemPrompt: "You are a friendly student financial mentor. Provide concise, human-readable, highly actionable advice with concrete steps. Avoid textbook boilerplate.",
          studentContext: {
            currencySymbol: profile?.countryData?.symbol || "₹",
            income,
            countryName: profile?.countryData?.name || "India",
          },
        }),
      });

      if (!res.ok) throw new Error("Expense audit API unavailable");
      const data = await res.json();
      setAiSummary(data.reply);
    } catch {
      const topCatEntry = categoryData.sort((a, b) => b.value - a.value)[0] || { name: "Food", value: 0 };
      const topCat = topCatEntry.name;
      const topVal = topCatEntry.value;
      const sym = profile?.countryData?.symbol || "₹";

      if (topCat === "Food") {
        setAiSummary(
          `• Food is your largest expense at ${formatCurrency(topVal, countryCode)} (${totalSpent > 0 ? Math.round((topVal / totalSpent) * 100) : 0}% of total spend).\n` +
          `• Step 1: Cap food delivery and dine-outs to once a week; cook staples in 3-day batches to save roughly ${sym}${Math.round(topVal * 0.25)} this month.\n` +
          `• Step 2: Buy groceries in bulk with roommates and utilize campus dining hall subsidized meal passes.`
        );
      } else if (topCat === "Transport") {
        setAiSummary(
          `• Transport leads your spending at ${formatCurrency(topVal, countryCode)}.\n` +
          `• Step 1: Switch from daily rideshare or single tickets to a monthly student transit/metro pass to save 20-30%.\n` +
          `• Step 2: Coordinate campus carpools with classmates or use bicycles for short trips under 3km.`
        );
      } else if (topCat === "Entertainment") {
        setAiSummary(
          `• Entertainment is your primary discretionary spend at ${formatCurrency(topVal, countryCode)}.\n` +
          `• Step 1: Share OTT and music family plans with campus friends to split recurring subscription costs in half.\n` +
          `• Step 2: Set a cash/UPI pocket allowance of ${sym}${Math.round(topVal / 4)}/week for social outings.`
        );
      } else {
        setAiSummary(
          `• Your highest spend is in ${topCat} at ${formatCurrency(topVal, countryCode)}.\n` +
          `• Step 1: Aim for a target cap of ${sym}${Math.round(topVal * 0.8)} next month by evaluating non-urgent purchases before buying.\n` +
          `• Step 2: Move the saved ${sym}${Math.round(topVal * 0.2)} difference straight into your savings account on payday.`
        );
      }
    } finally {
      setLoadingAi(false);
    }
  };

  // Group transactions by date
  const groupedExpenses = {};
  expenses.forEach((e) => {
    const d = e.date || new Date().toISOString().split("T")[0];
    if (!groupedExpenses[d]) {
      groupedExpenses[d] = [];
    }
    groupedExpenses[d].push(e);
  });

  const sortedDates = Object.keys(groupedExpenses).sort((a, b) => new Date(b) - new Date(a));

  const monthlyBudget = budget?.total || profile?.income || 15000;
  const dailyLimit = Math.round(monthlyBudget / 30);

  const getDailyStatusColor = (spent) => {
    if (spent > dailyLimit) return "text-danger bg-danger/10 border-danger/20";
    if (spent >= dailyLimit * 0.8) return "text-warning bg-warning/10 border-warning/20";
    return "text-accent bg-accent/10 border-accent/20";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" id="expenses-report">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Expense Analyzer</h1>
          <p className="text-xs text-textSecondary">Track, categorize, and optimize your monthly spending</p>
        </div>
      </div>

      {/* Grid: Form + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Add Expense Form */}
        <div className="glass p-6 rounded-2xl border border-border space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
              <Plus size={16} className="text-primary" /> Add Transaction
            </h2>
            {/* Type toggle */}
            <div className="flex bg-surface p-0.5 rounded-lg border border-border/80 text-[10px]">
              <button
                type="button"
                onClick={() => handleTypeChange("expense")}
                className={`px-2 py-1 rounded-md font-medium transition-all ${type === "expense" ? "bg-primary text-white" : "text-textSecondary hover:text-textPrimary"}`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("saving")}
                className={`px-2 py-1 rounded-md font-medium transition-all ${type === "saving" ? "bg-accent text-bg" : "text-textSecondary hover:text-textPrimary"}`}
              >
                Saving
              </button>
            </div>
          </div>

          <form onSubmit={handleAddExpense} className="space-y-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field"
              >
                {type === "saving"
                  ? SAVINGS_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))
                  : CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-textSecondary mb-1">Amount ({profile?.countryData?.symbol || "₹"})</label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="250"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs text-textSecondary mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs text-textSecondary mb-1">Note (Optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={type === "saving" ? "Emergency fund transfer..." : "Books, Groceries, Bus ticket..."}
                className="input-field"
              />
            </div>

            <button type="submit" className={`w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold rounded-xl text-white transition-all ${type === "saving" ? "bg-accent text-bg hover:opacity-90" : "bg-primary hover:opacity-90"}`}>
              {type === "saving" ? <PiggyBank size={16} /> : <Plus size={16} />}
              <span>Add {type === "saving" ? "Saving" : "Expense"}</span>
            </button>
          </form>
        </div>

        {/* Category Breakdown Chart */}
        <div className="glass p-6 rounded-2xl border border-border md:col-span-2 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
              <PieIcon size={16} className="text-accent" /> Expense Breakdown
            </h2>
            <div className="flex items-center gap-4 text-xs font-medium text-textSecondary">
              <span>
                Spent: <span className="font-bold text-danger">{formatCurrency(totalSpent, countryCode)}</span>
              </span>
              <span>
                Saved: <span className="font-bold text-accent">{formatCurrency(totalSaved, countryCode)}</span>
              </span>
            </div>
          </div>

          {categoryData.length > 0 ? (
            <div className="h-56 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={4}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(value, countryCode)}
                    contentStyle={{
                      backgroundColor: "#17171A",
                      borderColor: "#2A2A2E",
                      borderRadius: "8px",
                      color: "#ECE7DD",
                    }}
                    labelStyle={{ color: "#9B968C", fontWeight: 600 }}
                    itemStyle={{ color: "#ECE7DD" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-textSecondary text-xs">
              No transactions recorded for this month yet. Add your first expense or saving on the left!
            </div>
          )}

          {/* AI Expense Insights Button */}
          <div className="pt-4 border-t border-border flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <button
                onClick={handleGenerateSummary}
                disabled={loadingAi || activeMonthExpenses.length === 0}
                className="btn-ghost text-xs flex items-center gap-1.5 py-1.5"
              >
                <Sparkles size={14} className="text-primary" />
                <span>{loadingAi ? "Analyzing your expenses..." : "Generate IBM Expense Audit"}</span>
              </button>
            </div>
            {aiSummary && (
              <div className="card-inner p-3.5 rounded-xl border border-border/50 text-xs text-textPrimary leading-relaxed space-y-1.5">
                <div className="flex items-center gap-1.5 text-accent font-semibold text-[11px] uppercase tracking-wider">
                  <Sparkles size={12} />
                  <span>IBM Expense Audit & Action Steps</span>
                </div>
                <div className="whitespace-pre-line text-textPrimary text-xs leading-relaxed">
                  {aiSummary}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Grouped History timeline */}
      <div className="glass p-6 rounded-2xl border border-border">
        <h2 className="text-sm font-semibold text-textPrimary mb-4">Daily Transaction Timeline</h2>

        {sortedDates.length > 0 ? (
          <div className="space-y-6">
            {sortedDates.map((dateString) => {
              const dayItems = groupedExpenses[dateString];
              const daySpend = dayItems
                .filter((e) => e.type !== "saving")
                .reduce((sum, e) => sum + Number(e.amount), 0);
              const daySave = dayItems
                .filter((e) => e.type === "saving")
                .reduce((sum, e) => sum + Number(e.amount), 0);

              return (
                <div key={dateString} className="card-inner overflow-hidden">
                  {/* Date Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2.5 px-4 bg-white/[0.04] border-b border-white/[0.06] gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-textPrimary">{dateString}</span>
                      {daySpend > 0 && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${getDailyStatusColor(daySpend)}`}>
                          Spent: {formatCurrency(daySpend, countryCode)}
                        </span>
                      )}
                      {daySave > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20">
                          Saved: +{formatCurrency(daySave, countryCode)}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-textSecondary">
                      Daily limit: {formatCurrency(dailyLimit, countryCode)}
                    </span>
                  </div>

                  {/* Date Items */}
                  <div className="divide-y divide-border/40">
                    {dayItems.map((exp) => {
                      const isSaving = exp.type === "saving";
                      const itemColor = isSaving
                        ? SAVINGS_CATEGORY_COLORS[exp.category] || "#00D9A3"
                        : CATEGORY_COLORS[exp.category] || "#6C63FF";

                      return (
                        <div key={exp.id} className="flex justify-between items-center py-3 px-4 hover:bg-surface/30 transition-all text-xs">
                          <div className="flex items-center gap-3">
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: itemColor }} />
                            <div>
                              <p className="font-semibold text-textPrimary">{exp.category}</p>
                              <p className="text-[10px] text-textSecondary">{exp.note || "No note"}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className={`font-bold ${isSaving ? "text-accent" : "text-textPrimary"}`}>
                              {isSaving ? "+" : ""}{formatCurrency(exp.amount, countryCode)}
                            </span>
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 rounded text-textSecondary hover:text-danger hover:bg-danger/10 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-textSecondary text-center py-6">No transactions found.</p>
        )}
      </div>
    </div>
  );
}

