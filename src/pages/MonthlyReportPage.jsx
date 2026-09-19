import { useState } from "react";
import { Sparkles, Calendar, TrendingUp, CheckCircle, AlertTriangle, ArrowRight, Award, Download, PieChart } from "lucide-react";
import { formatCurrency } from "../lib/countries";
import { exportMonthlyReviewPDF } from "../lib/pdfExport";

const CATEGORY_COLORS = {
  Food: "#6C63FF",
  Transport: "#00D9A3",
  Rent: "#D4AF37",
  Entertainment: "#FF6584",
  Education: "#36A2EB",
  Healthcare: "#4BC0C0",
  Other: "#9966FF",
};

export default function MonthlyReportPage({ profile, expenses = [], budget }) {
  const countryCode = profile?.country || "IN";
  const currencySymbol = profile?.countryData?.symbol || "₹";

  // Compute unique YYYY-MM months from expense dates
  const availableMonths = Array.from(
    new Set(expenses.map((e) => (e.date || "").substring(0, 7)).filter((d) => d && d.length === 7))
  );
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  if (!availableMonths.includes(currentMonthStr)) {
    availableMonths.push(currentMonthStr);
  }
  availableMonths.sort((a, b) => b.localeCompare(a));

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [aiReport, setAiReport] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Filter transactions for selected month
  const monthlyTrans = expenses.filter((e) => (e.date || "").startsWith(selectedMonth));

  const totalIncome = budget?.total || profile?.income || 15000;
  const totalSpent = monthlyTrans
    .filter((e) => e.type !== "saving")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalSavedTrans = monthlyTrans
    .filter((e) => e.type === "saving")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // Income Left = income minus expenses minus savings
  const incomeLeft = totalIncome - totalSpent - totalSavedTrans;
  const incomeLeftPct = totalIncome > 0 ? Math.round((incomeLeft / totalIncome) * 100) : 0;
  const spentPct = totalIncome > 0 ? Math.round((totalSpent / totalIncome) * 100) : 0;

  // Actual vs Target Budget Allocations calculation
  const needsSpent = monthlyTrans
    .filter((e) => e.type !== "saving" && ["Food", "Transport", "Rent", "Education", "Healthcare"].includes(e.category))
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const wantsSpent = monthlyTrans
    .filter((e) => e.type !== "saving" && ["Entertainment", "Other"].includes(e.category))
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const targetAllocations = budget?.allocations || { Needs: 50, Wants: 30, Savings: 20 };
  const actualNeedsPct = totalIncome > 0 ? Math.round((needsSpent / totalIncome) * 100) : 0;
  const actualWantsPct = totalIncome > 0 ? Math.round((wantsSpent / totalIncome) * 100) : 0;
  // Savings % = only explicitly recorded savings entries, not leftover income
  const actualSavingsPct = totalIncome > 0 ? Math.round((totalSavedTrans / totalIncome) * 100) : 0;

  // Group by category
  const categories = ["Food", "Transport", "Rent", "Entertainment", "Education", "Healthcare", "Other"];
  const categoryData = categories
    .map((cat) => {
      const value = monthlyTrans
        .filter((e) => e.type !== "saving" && e.category === cat)
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const pct = totalSpent > 0 ? Math.round((value / totalSpent) * 100) : 0;
      return { name: cat, value, pct, color: CATEGORY_COLORS[cat] };
    })
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const handleGenerateReport = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/monthly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, expenses: monthlyTrans, budget }),
      });
      if (!res.ok) throw new Error("Report review API unavailable");
      const data = await res.json();
      setAiReport(data);
    } catch {
      // Math fallback
      const goals = profile?.goals || [];
      const goalAlignments = goals.map((g) => {
        const isSavingGoal = g.toLowerCase().includes("save") || g.toLowerCase().includes("fund");
        const status = isSavingGoal ? (totalSavedTrans > 0 ? "on-track" : "needs-focus") : "on-track";
        const message = isSavingGoal
          ? totalSavedTrans > 0
            ? `You actively saved ${formatCurrency(totalSavedTrans, countryCode)} in ${selectedMonth}. Keep building this habit to hit your goal.`
            : `No savings were recorded in ${selectedMonth}. Try transferring even a small amount to your savings to stay on track.`
          : `Make sure to review your wants categories weekly to ensure they align with "${g}".`;
        return { goal: g, status, message };
      });
      setAiReport({
        goalAlignments,
        overallVerdict: `In ${selectedMonth}, you spent ${formatCurrency(totalSpent, countryCode)} out of your ${formatCurrency(totalIncome, countryCode)} income. You actively saved ${formatCurrency(totalSavedTrans, countryCode)}, leaving ${formatCurrency(incomeLeft, countryCode)} as unspent income.`,
        nextMonthFocus: "Plan your Wants spending in advance and log savings transfers on payday next month.",
      });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleExportPDF = () => {
    exportMonthlyReviewPDF(
      { profile, expenses, budget, aiReport, selectedMonth },
      `Monthly-Report-${selectedMonth}`
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Month Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Month-End Review</h1>
          <p className="text-xs text-textSecondary">
            Review past monthly stats, check budget allocation matches, and cross-reference goals
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Month Selector */}
          <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-xl border border-border">
            <Calendar size={14} className="text-primary" />
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setAiReport(null);
              }}
              className="bg-transparent text-xs font-semibold text-textPrimary outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m} className="bg-surface text-textPrimary">
                  {m === currentMonthStr ? `${m} (Current)` : m}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportPDF}
            className="btn-primary flex items-center gap-2 text-xs py-2 px-4"
          >
            <Download size={14} />
            <span>Export Detailed PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Stats, Budget Allocations Match, and Category breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass p-4 rounded-2xl border border-border">
              <p className="text-[10px] text-textSecondary uppercase tracking-wider">Total Income</p>
              <p className="text-xl font-bold text-textPrimary">{formatCurrency(totalIncome, countryCode)}</p>
              <div className="text-[10px] text-textSecondary mt-1">Monthly allocation limit</div>
            </div>
            <div className="glass p-4 rounded-2xl border border-border">
              <p className="text-[10px] text-textSecondary uppercase tracking-wider">Total Spent ({selectedMonth})</p>
              <p className="text-xl font-bold text-danger">{formatCurrency(totalSpent, countryCode)}</p>
              <div className="text-[10px] text-textSecondary mt-1">{spentPct}% of income</div>
            </div>
            <div className="glass p-4 rounded-2xl border border-border">
              <p className="text-[10px] text-textSecondary uppercase tracking-wider">Income Left</p>
              <p className={`text-xl font-bold ${incomeLeft >= 0 ? "text-accent" : "text-danger"}`}>
                {formatCurrency(incomeLeft, countryCode)}
              </p>
              <div className="text-[10px] text-textSecondary mt-1">
                {incomeLeftPct}% of income unspent
                {totalSavedTrans > 0 && (
                  <span className="ml-1 text-accent">· {formatCurrency(totalSavedTrans, countryCode)} actively saved</span>
                )}
              </div>
            </div>
          </div>

          {/* Budget Allocation Match (Target vs Actual) */}
          <div className="glass p-6 rounded-2xl border border-border space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                <PieChart size={16} className="text-accent" /> Budget Allocation Match
              </h2>
              <span className="text-xs text-textSecondary">Target vs Actual ({selectedMonth})</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* Needs */}
              <div className="card-inner p-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-textPrimary">Needs</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${actualNeedsPct <= targetAllocations.Needs ? "text-accent bg-accent/10" : "text-danger bg-danger/10"}`}>
                    {actualNeedsPct <= targetAllocations.Needs ? "On Budget" : "Over Budget"}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-textSecondary">
                  <span>Target: {targetAllocations.Needs}%</span>
                  <span>Actual: {actualNeedsPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, actualNeedsPct)}%` }} />
                </div>
              </div>

              {/* Wants */}
              <div className="card-inner p-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-textPrimary">Wants</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${actualWantsPct <= targetAllocations.Wants ? "text-accent bg-accent/10" : "text-danger bg-danger/10"}`}>
                    {actualWantsPct <= targetAllocations.Wants ? "On Budget" : "Over Budget"}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-textSecondary">
                  <span>Target: {targetAllocations.Wants}%</span>
                  <span>Actual: {actualWantsPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-warning" style={{ width: `${Math.min(100, actualWantsPct)}%` }} />
                </div>
              </div>

              {/* Savings */}
              <div className="card-inner p-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-textPrimary">Savings</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${actualSavingsPct >= targetAllocations.Savings ? "text-accent bg-accent/10" : "text-warning bg-warning/10"}`}>
                    {actualSavingsPct >= targetAllocations.Savings ? "Target Met" : "Below Target"}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-textSecondary">
                  <span>Target: {targetAllocations.Savings}%</span>
                  <span>Recorded: {actualSavingsPct}% ({formatCurrency(totalSavedTrans, countryCode)})</span>
                </div>
                <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, actualSavingsPct))}%` }} />
                </div>
                {totalSavedTrans === 0 && (
                  <p className="text-[10px] text-warning">No savings logged yet — add savings entries in the Expenses tab.</p>
                )}
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="glass p-6 rounded-2xl border border-border space-y-4">
            <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" /> Category Breakdown ({selectedMonth})
            </h2>
            {categoryData.length > 0 ? (
              <div className="space-y-3">
                {categoryData.map((cat) => (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-textPrimary font-medium">{cat.name} ({cat.pct}%)</span>
                      <span className="font-bold text-textPrimary">{formatCurrency(cat.value, countryCode)}</span>
                    </div>
                    <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-border/40">
                      <div
                        className="h-full transition-all duration-500"
                        style={{ width: `${cat.pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-textSecondary text-center py-6">No expenses logged for {selectedMonth}.</p>
            )}
          </div>

          {/* Saved Transactions details */}
          {totalSavedTrans > 0 && (
            <div className="glass p-4 rounded-2xl border border-border flex justify-between items-center text-xs">
              <div>
                <p className="text-textSecondary font-medium">Recorded Savings Transfers ({selectedMonth})</p>
                <p className="text-base font-bold text-accent">+{formatCurrency(totalSavedTrans, countryCode)}</p>
              </div>
              <p className="text-[10px] text-textSecondary text-right max-w-xs">
                Transferred {formatCurrency(totalSavedTrans, countryCode)} into savings accounts during this period.
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Grok AI Goal Alignment and verdict */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 flex flex-col justify-between h-full min-h-[400px]">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles size={14} /> Grok AI Goal Alignment
                </span>
                <span className="text-[10px] text-textSecondary flex items-center gap-1">
                  <Calendar size={10} /> {selectedMonth}
                </span>
              </div>

              {!aiReport ? (
                <div className="space-y-4 my-auto pt-6 text-center">
                  <p className="text-xs text-textSecondary leading-relaxed">
                    Compare your actual spending in {selectedMonth} with your onboarding goals. Let Grok AI analyze where you stayed on track.
                  </p>
                  <button
                    onClick={handleGenerateReport}
                    disabled={loadingAi}
                    className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 font-semibold"
                  >
                    <Sparkles size={14} className={loadingAi ? "animate-spin" : ""} />
                    <span>{loadingAi ? "Analyzing Goals..." : "Generate AI Review"}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Goal list */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider">Goal Alignment Check</h3>
                    <div className="space-y-2">
                      {aiReport.goalAlignments?.map((item, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-surface/50 border border-border flex items-start gap-2.5 text-xs">
                          {item.status === "on-track" ? (
                            <CheckCircle size={16} className="text-accent shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-textPrimary">{item.goal}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${item.status === "on-track" ? "text-accent bg-accent/10" : "text-warning bg-warning/10"}`}>
                                {item.status === "on-track" ? "On Track" : "Needs Focus"}
                              </span>
                            </div>
                            <p className="text-[10px] text-textSecondary leading-relaxed">{item.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Overall Verdict */}
                  <div className="space-y-1.5 pt-3 border-t border-border/40">
                    <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                      <Award size={14} className="text-warning" /> Grok AI Monthly Verdict
                    </h3>
                    <p className="text-[11px] text-textSecondary leading-relaxed">{aiReport.overallVerdict}</p>
                  </div>

                  {/* Next month focus */}
                  <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 space-y-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                      Next Month Action Plan <ArrowRight size={10} />
                    </span>
                    <p className="text-xs text-textPrimary font-medium leading-normal">{aiReport.nextMonthFocus}</p>
                  </div>

                  {/* Generate again */}
                  <button
                    onClick={handleGenerateReport}
                    disabled={loadingAi}
                    className="btn-ghost w-full py-2 text-xs flex items-center justify-center gap-1.5 hover:text-primary transition-all text-textSecondary"
                  >
                    <Sparkles size={12} className={loadingAi ? "animate-spin" : ""} />
                    <span>Recalculate AI Review</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
