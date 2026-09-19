import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, MessageSquare, Receipt, Building2,
  GraduationCap, PiggyBank, LogOut, Menu, X, Sparkles,
  ChevronLeft, ChevronRight, Calendar
} from "lucide-react";
import { logOut } from "../lib/firebase";

const NAV_ITEMS = [
  { to: "/dashboard",      icon: LayoutDashboard, label: "Dashboard" },
  { to: "/chat",           icon: MessageSquare,   label: "FinBot AI" },
  { to: "/expenses",       icon: Receipt,         label: "Expenses" },
  { to: "/loans",          icon: Building2,        label: "Loans" },
  { to: "/scholarships",   icon: GraduationCap,   label: "Scholarships" },
  { to: "/budget",         icon: PiggyBank,        label: "Budget" },
  { to: "/monthly-report", icon: Calendar,         label: "Monthly Review" },
];

export default function Sidebar({ user, profile }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate  = useNavigate();

  const country = profile?.countryData;

  async function handleLogout() {
    await logOut();
    navigate("/");
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* ── Logo ─────────────────────── */}
      <div className={`flex items-center ${collapsed ? "justify-center py-5" : "gap-3 px-4 py-5"} border-b border-border`}>
        {!collapsed && (
          <>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #6C63FF, #00D9A3)" }}>
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-base gradient-text">FinWise AI</span>
              <p className="text-[10px] text-textSecondary leading-tight">Money mentor</p>
            </div>
          </>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`${collapsed ? "" : "ml-auto"} p-1.5 rounded-lg hover:bg-surface text-textSecondary hover:text-textPrimary transition-colors hidden md:block flex-shrink-0`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* ── Country Badge ─────────────── */}
      {!collapsed && country && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl glass flex items-center gap-2">
          <span className="text-xl">{country.flag}</span>
          <div>
            <p className="text-xs font-semibold text-textPrimary leading-tight">{country.name}</p>
            <p className="text-[10px] text-textSecondary">{country.currency} · {country.symbol}</p>
          </div>
        </div>
      )}

      {/* ── Nav Items ─────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to || location.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`sidebar-item ${active ? "active" : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── User + Logout ─────────────── */}
      <div className="px-3 py-4 border-t border-border">
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2">
            <img
              src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email || "U")}&background=6C63FF&color=fff`}
              alt="avatar"
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-textPrimary truncate">
                {user.displayName || user.email?.split("@")[0]}
              </p>
              <p className="text-[11px] text-textSecondary truncate">{user.email || ""}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="sidebar-item w-full text-left hover:text-danger"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Mobile Toggle ── */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-xl glass"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* ── Mobile Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Mobile Drawer ── */}
      <div className={`fixed top-0 left-0 h-full z-50 md:hidden transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: "260px", background: "#0B0B0D", borderRight: "1px solid #2A2A2E" }}>
        <SidebarContent />
      </div>

      {/* ── Desktop Sidebar ── */}
      <div className="hidden md:flex flex-col flex-shrink-0 transition-all duration-300"
        style={{ width: collapsed ? "68px" : "240px", background: "#0B0B0D", borderRight: "1px solid #2A2A2E", height: "100vh", position: "sticky", top: 0 }}>
        <SidebarContent />
      </div>
    </>
  );
}
