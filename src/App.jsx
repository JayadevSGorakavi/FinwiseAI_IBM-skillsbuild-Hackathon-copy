import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import DashboardPage from "./pages/DashboardPage";
import ChatPage from "./pages/ChatPage";
import ExpensesPage from "./pages/ExpensesPage";
import LoansPage from "./pages/LoansPage";
import ScholarshipsPage from "./pages/ScholarshipsPage";
import BudgetPage from "./pages/BudgetPage";
import MonthlyReportPage from "./pages/MonthlyReportPage";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";

import {
  onAuthChange,
  getProfile,
  saveProfile,
  getExpenses,
  addExpense,
  deleteExpense,
  getBudget,
  saveBudget,
} from "./lib/firebase";

import { getCountryByCode } from "./lib/countries";

// ============================================================
// DEFAULT DATA
// ============================================================

const DEFAULT_PROFILE = {
  country: "IN",
  countryData: getCountryByCode("IN"),
  name: "Aarav Sharma",
  university: "IIT Bombay",
  course: "Computer Science & Engineering",
  year: "2nd Year",
  income: 15000,
  currency: "INR",
  goals: ["Save for travel / laptop", "Build emergency fund"],
  onboarded: true,
};

const currentMonthIso = new Date().toISOString().substring(0, 7);
const INITIAL_EXPENSES = [
  {
    id: "1",
    category: "Food",
    amount: 3200,
    date: `${currentMonthIso}-02`,
    note: "Weekly groceries & dining out",
  },
  {
    id: "2",
    category: "Transport",
    amount: 800,
    date: `${currentMonthIso}-05`,
    note: "Metro pass",
  },
  {
    id: "3",
    category: "Education",
    amount: 1500,
    date: `${currentMonthIso}-08`,
    note: "Textbooks & reference code",
  },
  {
    id: "4",
    category: "Entertainment",
    amount: 650,
    date: `${currentMonthIso}-12`,
    note: "Movie & snacks",
  },
];

const DEFAULT_BUDGET = {
  total: 15000,
  incomeSources: [
    { id: "1", label: "Monthly Allowance", amount: 15000 },
  ],
  allocations: {
    Needs: 50,
    Wants: 30,
    Savings: 20,
  },
};

// ============================================================
// APP COMPONENT
// ============================================================

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [loading, setLoading] = useState(true);

  // ==========================================================
  // AUTH + INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      setLoading(true);

      const activeUid = currentUser?.uid || "guest_user";
      if (currentUser) {
        setUser(currentUser);
      }

      try {
        // 1. Profile
        const userProfile = await getProfile(activeUid);
        if (userProfile && userProfile.name) {
          setProfile({
            ...DEFAULT_PROFILE,
            ...userProfile,
            countryData: getCountryByCode(userProfile.country || "IN"),
          });
        } else if (currentUser) {
          // If profile does not exist yet, save default
          const baseProfile = {
            ...DEFAULT_PROFILE,
            name: currentUser.displayName || DEFAULT_PROFILE.name,
            email: currentUser.email || "",
          };
          delete baseProfile.countryData;
          await saveProfile(activeUid, baseProfile);
          setProfile({
            ...baseProfile,
            countryData: getCountryByCode(baseProfile.country || "IN"),
          });
        }

        // 2. Expenses
        const storedExpenses = await getExpenses(activeUid);
        if (storedExpenses && storedExpenses.length > 0) {
          const currentMonthIso = new Date().toISOString().substring(0, 7);
          const isOldAugustDemo = storedExpenses.every(e => (e.date || "").startsWith("2026-08"));
          if (isOldAugustDemo) {
            const updated = storedExpenses.map(e => ({
              ...e,
              date: (e.date || "").replace("2026-08", currentMonthIso),
            }));
            for (const exp of updated) {
              await addExpense(activeUid, exp);
            }
            setExpenses(updated);
          } else {
            setExpenses(storedExpenses);
          }
        } else {
          // Seed with initial expenses so user sees example data
          for (const exp of INITIAL_EXPENSES) {
            await addExpense(activeUid, exp);
          }
          setExpenses(INITIAL_EXPENSES);
        }

        // 3. Budget
        const storedBudget = await getBudget(activeUid);
        if (storedBudget) {
          setBudget({
            ...DEFAULT_BUDGET,
            ...storedBudget,
          });
        } else {
          await saveBudget(activeUid, DEFAULT_BUDGET);
          setBudget(DEFAULT_BUDGET);
        }
      } catch (error) {
        console.error("Failed to load user data:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ==========================================================
  // PROFILE HANDLER
  // ==========================================================

  const handleSetProfile = async (value) => {
    const nextProfile = typeof value === "function" ? value(profile) : value;
    setProfile(nextProfile);

    const activeUid = user?.uid || "guest_user";
    try {
      const cleanProfile = { ...nextProfile };
      delete cleanProfile.countryData;
      await saveProfile(activeUid, cleanProfile);
    } catch (error) {
      console.error("Failed to save profile:", error);
    }
  };

  // ==========================================================
  // BUDGET HANDLER
  // ==========================================================

  const handleSetBudget = async (value) => {
    const nextBudget = typeof value === "function" ? value(budget) : value;
    setBudget(nextBudget);

    const activeUid = user?.uid || "guest_user";
    try {
      await saveBudget(activeUid, nextBudget);
    } catch (error) {
      console.error("Failed to save budget:", error);
    }
  };

  // ==========================================================
  // EXPENSES HANDLER
  // ==========================================================

  const handleAddExpense = async (newExpenseData) => {
    const activeUid = user?.uid || "guest_user";
    const saved = await addExpense(activeUid, newExpenseData);
    setExpenses((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)]);
    return saved;
  };

  const handleDeleteExpense = async (id) => {
    const activeUid = user?.uid || "guest_user";
    await deleteExpense(id, activeUid);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const handleSetExpenses = async (value) => {
    const nextExpenses = typeof value === "function" ? value(expenses) : value;
    setExpenses(nextExpenses);
  };

  // ==========================================================
  // AUTHENTICATED LAYOUT
  // ==========================================================

  const AuthenticatedLayout = ({ children, title }) => (
    <div className="flex h-screen bg-bg text-textPrimary overflow-hidden">
      <Sidebar user={user} profile={profile} />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopBar user={user} profile={profile} title={title} />
        <main className="flex-1 min-h-0 bg-bg overflow-y-auto flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );

  // ==========================================================
  // LOADING SCREEN
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-textPrimary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-textSecondary font-mono">
            Loading FinWise AI...
          </span>
        </div>
      </div>
    );
  }

  // ==========================================================
  // ROUTES
  // ==========================================================

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Landing */}
        <Route path="/" element={<LandingPage />} />

        {/* Authentication */}
        <Route
          path="/auth"
          element={
            <AuthPage
              setUser={setUser}
              setProfile={handleSetProfile}
            />
          }
        />

        {/* Onboarding */}
        <Route
          path="/onboarding"
          element={
            <OnboardingPage
              user={user}
              setProfile={handleSetProfile}
            />
          }
        />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <AuthenticatedLayout title="Dashboard">
              <DashboardPage
                user={user}
                profile={profile}
                expenses={expenses}
                budget={budget}
              />
            </AuthenticatedLayout>
          }
        />

        {/* Chat */}
        <Route
          path="/chat"
          element={
            <AuthenticatedLayout title="FinBot AI Assistant">
              <ChatPage
                user={user}
                profile={profile}
                expenses={expenses}
                budget={budget}
              />
            </AuthenticatedLayout>
          }
        />

        {/* Expenses */}
        <Route
          path="/expenses"
          element={
            <AuthenticatedLayout title="Expense Analyzer">
              <ExpensesPage
                user={user}
                profile={profile}
                expenses={expenses}
                setExpenses={handleSetExpenses}
                onAddExpense={handleAddExpense}
                onDeleteExpense={handleDeleteExpense}
              />
            </AuthenticatedLayout>
          }
        />

        {/* Loans */}
        <Route
          path="/loans"
          element={
            <AuthenticatedLayout title="Student Loan Advisor">
              <LoansPage profile={profile} />
            </AuthenticatedLayout>
          }
        />

        {/* Scholarships */}
        <Route
          path="/scholarships"
          element={
            <AuthenticatedLayout title="Scholarship Finder">
              <ScholarshipsPage profile={profile} />
            </AuthenticatedLayout>
          }
        />

        {/* Budget */}
        <Route
          path="/budget"
          element={
            <AuthenticatedLayout title="Budget Planner">
              <BudgetPage
                user={user}
                profile={profile}
                budget={budget}
                setBudget={handleSetBudget}
              />
            </AuthenticatedLayout>
          }
        />

        {/* Monthly Report */}
        <Route
          path="/monthly-report"
          element={
            <AuthenticatedLayout title="Month-End Review">
              <MonthlyReportPage
                profile={profile}
                expenses={expenses}
                budget={budget}
              />
            </AuthenticatedLayout>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}