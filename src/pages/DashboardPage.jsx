import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, MessageSquare, Receipt, Building2, GraduationCap,
  PiggyBank, Calendar, TrendingUp, Plus, ArrowUpRight
} from "lucide-react";
import HealthScoreGauge from "../components/HealthScoreGauge";
import AIInsightCard from "../components/AIInsightCard";
import BudgetRing from "../components/BudgetRing";
import ScoreBreakdownPanel from "../components/ScoreBreakdownPanel";
import { formatCurrency, getScholarshipsForCountry, getLoansForCountry } from "../lib/countries";

export default function DashboardPage({ profile, expenses = [], budget }) {
  const countryCode = profile?.country || "IN";
  const currencySymbol = profile?.countryData?.symbol || "₹";

  const [healthScore, setHealthScore] = useState(78);
  const [healthGrade, setHealthGrade] = useState("B");
  const [aiTip, setAiTip] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [subScores, setSubScores] = useState({ savings: 25, budget: 25, goals: 15 });
  const [improvements, setImprovements] = useState([]);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const currentMonthExpenses = expenses.filter((e) => (e.date || "").startsWith(currentMonthStr));

  const isSavingEntry = (e) =>
    e.type === "saving" ||
    ["Emergency Fund", "Savings Account", "Investments", "Goal Saving"].includes(e.category);

  const totalIncome = profile?.income || budget?.total || 15000;
  const totalSpent = currentMonthExpenses
    .filter((e) => !isSavingEntry(e))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalSaved = currentMonthExpenses
    .filter((e) => isSavingEntry(e))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalBudget = budget?.total || totalIncome;
  const incomeLeft = totalBudget - totalSpent - totalSaved;

  const scholarships = getScholarshipsForCountry(countryCode).slice(0, 2);
  const loans = getLoansForCountry(countryCode).slice(0, 2);

  const fetchHealthScore = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/health-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, expenses: currentMonthExpenses, budget }),
      });
      if (!res.ok) throw new Error("Health score API unavailable");
      const data = await res.json();
      setHealthScore(data.score || 78);
      setHealthGrade(data.grade || "B");
      setAiTip(data.summary || "Your budget is looking healthy!");
      setSubScores(data.subScores || { savings: 25, budget: 25, goals: 15 });
      setImprovements(data.improvements || []);
    } catch {
      const savingsRate = totalIncome > 0 ? totalSaved / totalIncome : 0;
      const budgetAdherence = (totalSpent + totalSaved) <= totalBudget ? 30 : 10;
      const score = Math.round(Math.min(100, Math.max(35, (savingsRate * 50) + budgetAdherence + 20)));
      const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
      setHealthScore(score);
      setHealthGrade(grade);
      setAiTip(totalSaved > 0
        ? `Great job! You've actively saved ${formatCurrency(totalSaved, countryCode)} this month.`
        : "Keep your non-essential expenses under 30% of total income and log your savings transfers early.");

      const savingsSub = Math.round(Math.min(40, savingsRate * 40));
      const budgetSub = (totalSpent + totalSaved) <= totalBudget ? 30 : 10;
      const goalsSub = 15;
      setSubScores({ savings: savingsSub, budget: budgetSub, goals: goalsSub });
      setImprovements([
        { points: 5, action: "Track micro-expenses daily", why: "Identifies leakage in wants budget category" },
        { points: 10, action: "Set up automatic monthly savings transfers", why: "Enforces consistent savings rate habit" },
        { points: 15, action: "Review and cancel unused subscriptions", why: "Reduces core needs expenses directly" }
      ]);
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    fetchHealthScore();
  }, [expenses]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Welcome Banner ─────────────────────────────────── */}
      <div className="glass p-6 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-textPrimary">
              Welcome back, {profile?.name || "Student"} 👋
            </h1>
            <span className="text-xl">{profile?.countryData?.flag}</span>
          </div>
          <p className="text-xs text-textSecondary">
            Studying {profile?.course || "General Studies"} at {profile?.university || "University"} · {profile?.year || "Student"}
          </p>
        </div>

        <Link to="/chat" className="btn-primary flex items-center gap-2 text-xs py-2.5 px-4">
          <Sparkles size={14} />
          <span>Ask FinBot AI</span>
        </Link>
      </div>

      {/* ── Core Grid: Health Score, Budget, AI Insight, Burn Rate ───── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
        {/* Widget 1: AI Health Score */}
        <div className="glass p-6 rounded-2xl border border-border flex flex-col items-center justify-start h-full">
          <div className="w-full flex justify-between items-center mb-4">
            <span className="text-xs font-semibold text-textSecondary uppercase tracking-wider">AI Financial Health Score</span>
            <span className="badge badge-primary">Grok AI</span>
          </div>
          <HealthScoreGauge score={healthScore} grade={healthGrade} />
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="btn-ghost text-[11px] mt-4 py-1 px-3 flex items-center gap-1 hover:text-primary"
          >
            <span>{showBreakdown ? "Hide Details ▲" : "How to Improve ▼"}</span>
          </button>
          {showBreakdown && (
            <ScoreBreakdownPanel subScores={subScores} improvements={improvements} />
          )}
        </div>

        {/* Widget 2: Budget Ring */}
        <div className="glass p-6 rounded-2xl border border-border flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-textSecondary uppercase tracking-wider">Monthly Budget</span>
            <Link to="/budget" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              Details <ArrowUpRight size={12} />
            </Link>
          </div>
          <BudgetRing spent={totalSpent} saved={totalSaved} total={totalBudget} countryCode={countryCode} />
        </div>

        {/* Widget 3: Daily AI Insight */}
        <div className="flex flex-col justify-between">
          <AIInsightCard tip={aiTip} loading={loadingAi} onRefresh={fetchHealthScore} />

          {/* Quick Action Grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Link to="/expenses" className="glass p-3 rounded-xl hover:border-primary/40 transition-all flex items-center gap-2 text-xs text-textPrimary">
              <Receipt size={16} className="text-primary" />
              <span>Add Expense</span>
            </Link>
            <Link to="/chat" className="glass p-3 rounded-xl hover:border-primary/40 transition-all flex items-center gap-2 text-xs text-textPrimary">
              <MessageSquare size={16} className="text-accent" />
              <span>Ask FinBot</span>
            </Link>
            <Link to="/loans" className="glass p-3 rounded-xl hover:border-primary/40 transition-all flex items-center gap-2 text-xs text-textPrimary">
              <Building2 size={16} className="text-warning" />
              <span>Check Loans</span>
            </Link>
            <Link to="/scholarships" className="glass p-3 rounded-xl hover:border-primary/40 transition-all flex items-center gap-2 text-xs text-textPrimary">
              <GraduationCap size={16} className="text-primary" />
              <span>Scholarships</span>
            </Link>
          </div>
        </div>

        {/* Widget 4: Budget Burn Rate Projection */}
        <div className="glass p-6 rounded-2xl border border-border flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-textSecondary uppercase tracking-wider">Burn Rate & Forecast</span>
            <span className="badge badge-accent">Needs & Wants Only</span>
          </div>
          {(() => {
            const today = new Date();
            const currentDay = today.getDate();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const percentElapsed = Math.round((currentDay / daysInMonth) * 100);

            // Strictly filter to Needs and Wants categories (all savings excluded)
            const isSaving = (e) =>
              e.type === "saving" ||
              ["Emergency Fund", "Savings Account", "Investments", "Goal Saving"].includes(e.category);

            const needsCats = ["Food", "Transport", "Rent", "Education", "Healthcare"];
            const needsSpent = currentMonthExpenses
              .filter((e) => !isSaving(e) && needsCats.includes(e.category))
              .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

            const wantsSpent = currentMonthExpenses
              .filter((e) => !isSaving(e) && !needsCats.includes(e.category))
              .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

            const totalNeedsAndWants = needsSpent + wantsSpent;
            const dailyBurn = currentDay > 0 ? Math.round(totalNeedsAndWants / currentDay) : 0;
            const projectedSpend = Math.round(dailyBurn * daysInMonth);

            // Target budget for Needs + Wants (excluding savings allocation)
            const allocations = budget?.allocations || { Needs: 50, Wants: 30, Savings: 20 };
            const spendBudgetPct = ((Number(allocations.Needs) || 50) + (Number(allocations.Wants) || 30)) / 100;
            const spendBudget = Math.round(totalBudget * spendBudgetPct);

            const isOver = projectedSpend > spendBudget;
            const overAmt = projectedSpend - spendBudget;
            const spendPercent = spendBudget > 0 ? Math.round((projectedSpend / spendBudget) * 100) : 0;
            
            return (
              <div className="space-y-3.5 my-auto">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-textSecondary uppercase tracking-wider">Daily Burn Rate</p>
                    <p className="text-xl font-bold text-textPrimary">
                      {formatCurrency(dailyBurn, countryCode)}
                      <span className="text-xs font-normal text-textSecondary">/day</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-textSecondary uppercase tracking-wider">Projected Spend</p>
                    <p className={`text-xl font-bold ${isOver ? 'text-danger' : 'text-accent'}`}>
                      {formatCurrency(projectedSpend, countryCode)}
                    </p>
                  </div>
                </div>

                {/* Sub-breakdown: Needs vs Wants */}
                <div className="card-inner px-3 py-1.5 rounded-lg flex items-center justify-between text-[10px] text-textSecondary">
                  <span>Needs: <strong className="text-textPrimary">{formatCurrency(needsSpent, countryCode)}</strong></span>
                  <span>Wants: <strong className="text-textPrimary">{formatCurrency(wantsSpent, countryCode)}</strong></span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-textSecondary">
                    <span>Day {currentDay} of {daysInMonth} ({percentElapsed}%)</span>
                    <span className={isOver ? "text-danger font-medium" : "text-textPrimary font-medium"}>
                      Pace: {spendPercent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden border border-border/40">
                    <div 
                      className="h-full bg-primary transition-all duration-500" 
                      style={{ width: `${percentElapsed}%` }}
                    />
                  </div>
                </div>

                {isOver ? (
                  <div className="p-3 rounded-xl bg-danger/15 border border-danger/30 text-danger text-[11px] leading-snug">
                    ⚠️ Pacing to exceed your {formatCurrency(spendBudget, countryCode)} Needs & Wants budget by <strong>{formatCurrency(overAmt, countryCode)}</strong>.
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-accent text-[11px] leading-snug">
                    🟢 Great! Your daily burn of <strong>{formatCurrency(dailyBurn, countryCode)}/day</strong> is on track within budget.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>


      {/* ── Second Row: Deadlines + Recommended Loans ──────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upcoming Scholarship Deadlines */}
        <div className="glass p-6 rounded-2xl border border-border space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-accent" />
              <h3 className="font-semibold text-textPrimary text-sm">Upcoming Scholarship Deadlines</h3>
            </div>
            <Link to="/scholarships" className="text-xs text-accent hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="space-y-3">
            {scholarships.map((s) => (
              <div key={s.id} className="p-3 rounded-xl bg-surface border border-border/80 flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-semibold text-textPrimary">{s.name}</h4>
                  <p className="text-[11px] text-textSecondary">{s.provider}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-accent">{formatCurrency(s.amount, countryCode)}</span>
                  <p className="text-[10px] text-warning font-medium">Due: {s.deadline}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Eligible Loans */}
        <div className="glass p-6 rounded-2xl border border-border space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-warning" />
              <h3 className="font-semibold text-textPrimary text-sm">Top Loan Schemes ({profile?.countryData?.name})</h3>
            </div>
            <Link to="/loans" className="text-xs text-warning hover:underline flex items-center gap-1">
              Calculator <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="space-y-3">
            {loans.map((l) => (
              <div key={l.id} className="p-3 rounded-xl bg-surface border border-border/80 flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-semibold text-textPrimary">{l.name}</h4>
                  <p className="text-[11px] text-textSecondary">{l.provider}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-primary">{l.interestRate}% p.a.</span>
                  <p className="text-[10px] text-textSecondary">Up to {formatCurrency(l.maxAmount, countryCode)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
