/**
 * pdfExport.js — jsPDF + html2canvas export utilities
 */
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Export a DOM element to PDF
 * @param {string} elementId - ID of the DOM element to capture
 * @param {string} filename  - Output filename without extension
 * @param {object} options   - { title, studentName, subtitle }
 */
export async function exportToPDF(elementId, filename = "finwise-report", options = {}) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Element not found:", elementId);
    return;
  }

  const canvas = await html2canvas(element, {
    backgroundColor: "#0B0B0D",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf     = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pdfW    = pdf.internal.pageSize.getWidth();
  const pdfH    = pdf.internal.pageSize.getHeight();

  // ─── Header ─────────────────────────────────────────────────
  pdf.setFillColor(11, 11, 13);
  pdf.rect(0, 0, pdfW, pdfH, "F");

  pdf.setFontSize(20);
  pdf.setTextColor(108, 99, 255);
  pdf.setFont("helvetica", "bold");
  pdf.text("FinWise AI", 14, 14);

  if (options.title) {
    pdf.setFontSize(12);
    pdf.setTextColor(236, 231, 221);
    pdf.setFont("helvetica", "normal");
    pdf.text(options.title, 14, 22);
  }

  if (options.studentName) {
    pdf.setFontSize(10);
    pdf.setTextColor(155, 150, 140);
    pdf.text(`Student: ${options.studentName}`, 14, 29);
  }

  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  pdf.setFontSize(9);
  pdf.setTextColor(155, 150, 140);
  pdf.text(`Generated: ${dateStr}`, pdfW - 14, 14, { align: "right" });

  // ─── Divider ─────────────────────────────────────────────────
  pdf.setDrawColor(42, 42, 46);
  pdf.line(14, 33, pdfW - 14, 33);

  // ─── Content ─────────────────────────────────────────────────
  const imgRatio  = canvas.width / canvas.height;
  const imgWidth  = pdfW - 28;
  const imgHeight = imgWidth / imgRatio;
  const startY    = 37;
  const maxH      = pdfH - startY - 12;

  if (imgHeight <= maxH) {
    pdf.addImage(imgData, "PNG", 14, startY, imgWidth, imgHeight);
  } else {
    // Multi-page
    let remaining = imgHeight;
    let pageY     = startY;
    let srcY      = 0;

    while (remaining > 0) {
      const sliceH = Math.min(maxH, remaining);
      pdf.addImage(imgData, "PNG", 14, pageY, imgWidth, imgHeight, "", "FAST", 0, srcY / imgHeight);
      remaining -= sliceH;
      srcY      += (sliceH / imgHeight) * canvas.height;
      if (remaining > 0) {
        pdf.addPage();
        pdf.setFillColor(11, 11, 13);
        pdf.rect(0, 0, pdfW, pdfH, "F");
        pageY = 14;
      }
    }
  }

  // ─── Footer ──────────────────────────────────────────────────
  pdf.setFontSize(8);
  pdf.setTextColor(155, 150, 140);
  pdf.text("Powered by Grok AI · FinWise AI", pdfW / 2, pdfH - 8, { align: "center" });

  pdf.save(`${filename}.pdf`);
}

/** Quick summary PDF without capturing a DOM element */
export function exportSummaryPDF(data, filename = "finwise-summary") {
  const pdf  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pdfW = pdf.internal.pageSize.getWidth();
  let y = 14;

  pdf.setFillColor(11, 11, 13);
  pdf.rect(0, 0, pdfW, pdf.internal.pageSize.getHeight(), "F");

  pdf.setFontSize(22);
  pdf.setTextColor(108, 99, 255);
  pdf.setFont("helvetica", "bold");
  pdf.text("FinWise AI Report", 14, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.setTextColor(155, 150, 140);
  pdf.text(`Generated ${new Date().toLocaleDateString()}`, 14, y);
  y += 8;

  pdf.setDrawColor(42, 42, 46);
  pdf.line(14, y, pdfW - 14, y);
  y += 8;

  for (const [section, items] of Object.entries(data)) {
    pdf.setFontSize(13);
    pdf.setTextColor(0, 217, 163);
    pdf.setFont("helvetica", "bold");
    pdf.text(section, 14, y);
    y += 7;

    for (const [key, value] of Object.entries(items)) {
      pdf.setFontSize(10);
      pdf.setTextColor(236, 231, 221);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${key}:`, 18, y);
      pdf.setTextColor(212, 175, 55);
      pdf.text(String(value), 80, y);
      y += 6;
    }
    y += 4;
  }

  pdf.setFontSize(8);
  pdf.setTextColor(155, 150, 140);
  pdf.text("Powered by Grok AI · FinWise AI", pdfW / 2, pdf.internal.pageSize.getHeight() - 8, { align: "center" });

  pdf.save(`${filename}.pdf`);
}

/**
 * Structured Monthly Review PDF
 * Sections:
 *   1. Monthly Summary
 *   2. Budget Expectation vs Actual
 *   3. Spending by Category
 *   4. Daily Spend & Savings Log (per day)
 *   5. Grok AI Goal Alignment (if available)
 */
export function exportMonthlyReviewPDF(
  { profile, expenses = [], budget, aiReport, selectedMonth },
  filename = "Monthly-Review-Report"
) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  let y = 15;
  let currentPage = 1;

  // Safe Currency symbol mapping for jsPDF standard Helvetica (which doesn't render ₹/Unicode symbols correctly)
  const getSafeCurrencySymbol = (profile) => {
    const rawSymbol = profile?.countryData?.symbol || "$";
    const currencyCode = profile?.countryData?.currency || "INR";
    if (rawSymbol === "₹" || currencyCode === "INR") {
      return "Rs.";
    }
    // Return code or symbol based on safety
    if (rawSymbol.charCodeAt(0) > 127) {
      return currencyCode; // Fallback to currency code e.g. CAD, AUD, etc.
    }
    return rawSymbol;
  };

  const safeSymbol = getSafeCurrencySymbol(profile);

  const fmt = (val) =>
    `${safeSymbol} ${Number(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Colors: Light-theme re-themed palette
  const cIndigo = [79, 70, 229];     // Primary brand: Indigo (#4F46E5)
  const cCharcoal = [31, 41, 55];    // Primary text: Dark Charcoal (#1F2937)
  const cGrayText = [75, 85, 99];    // Secondary text: Gray (#4B5563)
  const cBorder = [229, 231, 235];    // Light Grey Border (#E5E7EB)
  const cLightBg = [249, 250, 251];   // Summary card fill (#F9FAFB)
  const cHeaderBg = [243, 244, 246];  // Table header fill (#F3F4F6)
  const cGreen = [16, 185, 129];     // Success: Emerald Green (#16B981)
  const cRed = [239, 68, 68];        // Danger: Rose Red (#EF4444)
  const cOrange = [217, 119, 6];      // Warning: Amber (#D97706)

  // ── Helpers ─────────────────────────────────────────────────
  const addHeader = (pageNum) => {
    // Header space on white background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pdfW, 25, "F");

    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...cIndigo);
    pdf.text("FinWise AI — Monthly Financial Report", margin, 16);

    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...cGrayText);
    const ds = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    pdf.text(`Generated: ${ds} | Page ${pageNum}`, pdfW - margin, 16, { align: "right" });

    pdf.setDrawColor(...cBorder);
    pdf.line(margin, 24, pdfW - margin, 24);
  };

  const checkPageBreak = (needed) => {
    if (y + needed > pdfH - 18) {
      pdf.addPage();
      currentPage++;
      addHeader(currentPage);
      y = 33;
    }
  };

  const sectionTitle = (text) => {
    checkPageBreak(14);
    pdf.setFontSize(10.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...cIndigo);
    pdf.text(text, margin, y);
    pdf.setDrawColor(...cIndigo);
    pdf.line(margin, y + 2, pdfW - margin, y + 2);
    y += 9;
  };

  // ── Start ────────────────────────────────────────────────────
  addHeader(currentPage);
  y = 33;

  // Student metadata (Readable dark grey text)
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...cCharcoal);
  pdf.text(`Student: ${profile?.name || "Student"}`, margin, y);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...cGrayText);
  pdf.text(`University: ${profile?.university || "N/A"}`, margin + 85, y);
  y += 6;
  pdf.setTextColor(...cGrayText);
  pdf.text(`Course: ${profile?.course || "N/A"} (${profile?.year || "N/A"})`, margin, y);
  pdf.text(`Report Month: ${selectedMonth || "Current"}`, margin + 85, y);
  y += 9;
  pdf.setDrawColor(...cBorder);
  pdf.line(margin, y, pdfW - margin, y);
  y += 7;

  // ── Data preparation ─────────────────────────────────────────
  const monthlyTrans = expenses
    .filter((e) => (e.date || "").startsWith(selectedMonth))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const totalIncome  = budget?.total || profile?.income || 15000;
  const totalSpent   = monthlyTrans.filter((e) => e.type !== "saving").reduce((s, e) => s + Number(e.amount), 0);
  const totalSavedTx = monthlyTrans.filter((e) => e.type === "saving").reduce((s, e) => s + Number(e.amount), 0);
  const incomeLeft   = totalIncome - totalSpent - totalSavedTx;
  const spentPct     = totalIncome > 0 ? Math.round((totalSpent / totalIncome) * 100) : 0;
  const savingsPct   = totalIncome > 0 ? Math.round((totalSavedTx / totalIncome) * 100) : 0;
  const incomeLeftPct = totalIncome > 0 ? Math.round((incomeLeft / totalIncome) * 100) : 0;

  // ── Section 1: Monthly Summary ───────────────────────────────
  sectionTitle("1. Monthly Summary");

  const colW = (pdfW - margin * 2 - 9) / 4;
  const summaryBoxes = [
    { label: "TOTAL INCOME",  val: fmt(totalIncome),  rgb: cCharcoal },
    { label: "TOTAL SPENT",   val: fmt(totalSpent),   rgb: cRed  },
    { label: "TOTAL SAVED",   val: fmt(totalSavedTx), rgb: cGreen },
    { label: "INCOME LEFT",   val: fmt(incomeLeft),   rgb: incomeLeft >= 0 ? cIndigo : cRed },
  ];

  summaryBoxes.forEach((b, i) => {
    const bx = margin + i * (colW + 3);
    // Draw card box with a light background and light border
    pdf.setFillColor(...cLightBg);
    pdf.setDrawColor(...cBorder);
    pdf.roundedRect(bx, y, colW, 18, 1.5, 1.5, "FD");

    pdf.setFontSize(6);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...cGrayText);
    pdf.text(b.label, bx + 3, y + 5.5);

    pdf.setFontSize(9);
    pdf.setTextColor(...b.rgb);
    pdf.text(b.val, bx + 3, y + 14);
  });
  y += 24;

  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...cGrayText);
  pdf.text(
    `Spent: ${spentPct}% of income  |  Actively saved: ${savingsPct}% (${fmt(totalSavedTx)})  |  Income left: ${incomeLeftPct}% (${fmt(incomeLeft)})`,
    margin, y
  );
  y += 9;

  // ── Section 2: Budget Expectation vs Actual ──────────────────
  sectionTitle("2. Budget Expectation vs Actual");

  const targets = budget?.allocations || { Needs: 50, Wants: 30, Savings: 20 };
  const needsCats  = ["Food", "Transport", "Rent", "Education", "Healthcare"];
  const wantsCats  = ["Entertainment", "Other"];

  const needsSpent = monthlyTrans
    .filter((e) => e.type !== "saving" && needsCats.includes(e.category))
    .reduce((s, e) => s + Number(e.amount), 0);
  const wantsSpent = monthlyTrans
    .filter((e) => e.type !== "saving" && wantsCats.includes(e.category))
    .reduce((s, e) => s + Number(e.amount), 0);

  const aNeedsPct = totalIncome > 0 ? Math.round((needsSpent / totalIncome) * 100) : 0;
  const aWantsPct = totalIncome > 0 ? Math.round((wantsSpent / totalIncome) * 100) : 0;

  const allocationRows = [
    {
      label: "Needs (Food, Rent, Transport, Education, Healthcare)",
      target: targets.Needs,
      actual: aNeedsPct,
      spent: needsSpent,
      targetAmt: (targets.Needs / 100) * totalIncome,
      ok: aNeedsPct <= targets.Needs,
    },
    {
      label: "Wants (Entertainment, Other)",
      target: targets.Wants,
      actual: aWantsPct,
      spent: wantsSpent,
      targetAmt: (targets.Wants / 100) * totalIncome,
      ok: aWantsPct <= targets.Wants,
    },
    {
      label: "Savings (Actively Saved)",
      target: targets.Savings,
      actual: savingsPct,
      spent: totalSavedTx,
      targetAmt: (targets.Savings / 100) * totalIncome,
      ok: savingsPct >= targets.Savings,
    },
  ];

  // Header row - fixed height to 9 for vertical padding, and positioned X values to avoid overlap
  pdf.setFillColor(...cHeaderBg);
  pdf.rect(margin, y, pdfW - margin * 2, 9, "F");
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...cCharcoal);
  pdf.text("Category",   margin + 3,        y + 6);
  pdf.text("Target %",   margin + 80,       y + 6);
  pdf.text("Target Amt", margin + 100,      y + 6);
  pdf.text("Actual %",   margin + 125,      y + 6);
  pdf.text("Actual Amt", margin + 144,      y + 6);
  pdf.text("Status",     pdfW - margin - 3, y + 6, { align: "right" });
  y += 11;

  allocationRows.forEach((row, idx) => {
    checkPageBreak(9);
    if (idx % 2 === 0) {
      pdf.setFillColor(...cLightBg);
      pdf.rect(margin, y - 4, pdfW - margin * 2, 8, "F");
    }
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...cCharcoal);
    pdf.text(row.label, margin + 3, y);
    pdf.text(`${row.target}%`, margin + 83, y);
    pdf.text(fmt(row.targetAmt), margin + 100, y);
    pdf.text(`${row.actual}%`, margin + 128, y);

    const okRgb = row.ok ? cGreen : cRed;
    pdf.setTextColor(...okRgb);
    pdf.text(fmt(row.spent), margin + 144, y);

    pdf.setFont("helvetica", "bold");
    const diff = Math.abs(row.actual - row.target);
    pdf.text(
      row.ok ? "On Track" : `Over +${diff}%`,
      pdfW - margin - 3, y, { align: "right" }
    );
    y += 8;
  });
  y += 5;

  // ── Section 3: Spending by Category ─────────────────────────
  sectionTitle("3. Spending by Category");

  const allCats = ["Food", "Transport", "Rent", "Entertainment", "Education", "Healthcare", "Other"];
  const catData = allCats
    .map((cat) => {
      const val = monthlyTrans
        .filter((e) => e.type !== "saving" && e.category === cat)
        .reduce((s, e) => s + Number(e.amount), 0);
      const pct = totalSpent > 0 ? Math.round((val / totalSpent) * 100) : 0;
      return { name: cat, value: val, pct };
    })
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  if (catData.length > 0) {
    pdf.setFillColor(...cHeaderBg);
    pdf.rect(margin, y, pdfW - margin * 2, 9, "F");
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...cCharcoal);
    pdf.text("Category",     margin + 3,   y + 6);
    pdf.text("Amount Spent", margin + 80,  y + 6);
    pdf.text("% of Expenses", margin + 130, y + 6);
    y += 11;

    catData.forEach((cat, idx) => {
      checkPageBreak(8);
      if (idx % 2 === 0) {
        pdf.setFillColor(...cLightBg);
        pdf.rect(margin, y - 4, pdfW - margin * 2, 8, "F");
      }
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...cCharcoal);
      pdf.text(cat.name, margin + 3, y);
      pdf.text(fmt(cat.value), margin + 80, y);
      pdf.text(`${cat.pct}%`, margin + 130, y);

      // Mini progress bar in categories
      const barX = margin + 152;
      const barW = pdfW - margin - barX - 3;
      pdf.setFillColor(...cBorder);
      pdf.rect(barX, y - 3, barW, 2.5, "F");
      pdf.setFillColor(...cIndigo);
      pdf.rect(barX, y - 3, barW * (cat.pct / 100), 2.5, "F");
      y += 8;
    });
    y += 5;
  } else {
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...cGrayText);
    pdf.text("No expenses logged for this month.", margin + 3, y);
    y += 10;
  }

  // ── Section 4: Daily Spend & Savings Log ─────────────────────
  sectionTitle("4. Daily Spend & Savings Log");

  const dailyGroups = {};
  monthlyTrans.forEach((t) => {
    const d = t.date || selectedMonth + "-01";
    if (!dailyGroups[d]) dailyGroups[d] = [];
    dailyGroups[d].push(t);
  });
  const sortedDays = Object.keys(dailyGroups).sort();

  const [yrStr, moStr] = (selectedMonth || "2024-01").split("-");
  const daysInMonth = new Date(parseInt(yrStr), parseInt(moStr), 0).getDate();
  const dailyLimit  = Math.round(totalIncome / daysInMonth);

  if (sortedDays.length > 0) {
    // Table header - height set to 9, y baseline offset to 6 to fix descender cut-off
    pdf.setFillColor(...cHeaderBg);
    pdf.rect(margin, y, pdfW - margin * 2, 9, "F");
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...cCharcoal);
    pdf.text("Date",        margin + 3,       y + 6);
    pdf.text("Spent",       margin + 38,      y + 6);
    pdf.text("Saved",       margin + 78,      y + 6);
    pdf.text("Daily Limit", margin + 112,     y + 6);
    pdf.text("Status",      margin + 148,     y + 6);
    pdf.text("Txns",        pdfW - margin - 3, y + 6, { align: "right" });
    y += 11;

    let runningSpent = 0;

    sortedDays.forEach((day, idx) => {
      checkPageBreak(9);

      const items    = dailyGroups[day];
      const daySpent = items.filter((e) => e.type !== "saving").reduce((s, e) => s + Number(e.amount), 0);
      const daySaved = items.filter((e) => e.type === "saving").reduce((s, e) => s + Number(e.amount), 0);
      runningSpent  += daySpent;

      const isOver = daySpent > dailyLimit;
      const isNear = !isOver && daySpent >= dailyLimit * 0.8;

      if (idx % 2 === 0) {
        pdf.setFillColor(...cLightBg);
        pdf.rect(margin, y - 4, pdfW - margin * 2, 8, "F");
      }

      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");

      // Date
      pdf.setTextColor(...cCharcoal);
      pdf.text(day, margin + 3, y);

      // Spent
      if (daySpent > 0) {
        pdf.setTextColor(...(isOver ? cRed : cCharcoal));
        pdf.text(fmt(daySpent), margin + 38, y);
      } else {
        pdf.setTextColor(...cGrayText);
        pdf.text("—", margin + 38, y);
      }

      // Saved
      if (daySaved > 0) {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...cGreen);
        pdf.text(`+${fmt(daySaved)}`, margin + 78, y);
        pdf.setFont("helvetica", "normal");
      } else {
        pdf.setTextColor(...cGrayText);
        pdf.text("—", margin + 78, y);
      }

      // Daily limit
      pdf.setTextColor(...cGrayText);
      pdf.text(fmt(dailyLimit), margin + 112, y);

      // Status
      if (daySpent === 0) {
        pdf.setTextColor(...cGrayText);
        pdf.text("No spend", margin + 148, y);
      } else if (isOver) {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...cRed);
        pdf.text("Over limit", margin + 148, y);
        pdf.setFont("helvetica", "normal");
      } else if (isNear) {
        pdf.setTextColor(...cOrange);
        pdf.text("Near limit", margin + 148, y);
      } else {
        pdf.setTextColor(...cGreen);
        pdf.text("Within limit", margin + 148, y);
      }

      // Txn count
      pdf.setTextColor(...cGrayText);
      pdf.text(`${items.length}`, pdfW - margin - 3, y, { align: "right" });
      y += 8;
    });

    // Totals footer row
    checkPageBreak(10);
    pdf.setFillColor(...cHeaderBg);
    pdf.rect(margin, y, pdfW - margin * 2, 8, "F");
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...cCharcoal);
    pdf.text("MONTH TOTAL", margin + 3, y + 5.5);
    pdf.setTextColor(...cRed);
    pdf.text(fmt(runningSpent), margin + 38, y + 5.5);
    pdf.setTextColor(...cGreen);
    pdf.text(fmt(totalSavedTx), margin + 78, y + 5.5);
    y += 13;
  } else {
    checkPageBreak(10);
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...cGrayText);
    pdf.text("No transactions recorded for this month.", margin + 3, y);
    y += 10;
  }

  // ── Section 5: Grok AI Goal Alignment ───────────────────────
  if (aiReport?.goalAlignments?.length > 0) {
    sectionTitle("5. Grok AI Goal Alignment Review");

    aiReport.goalAlignments.forEach((item) => {
      checkPageBreak(16);
      const isOk = item.status === "on-track";
      pdf.setFontSize(8.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...cCharcoal);
      pdf.text(`• ${item.goal}`, margin + 2, y);

      pdf.setTextColor(...(isOk ? cGreen : cOrange));
      pdf.text(`[${isOk ? "ON TRACK" : "NEEDS FOCUS"}]`, margin + 120, y);
      y += 5;

      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...cGrayText);
      const lines = pdf.splitTextToSize(item.message, pdfW - margin * 2 - 8);
      pdf.text(lines, margin + 6, y);
      y += lines.length * 4.5 + 3;
    });

    if (aiReport.overallVerdict) {
      checkPageBreak(20);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...cCharcoal);
      pdf.text("AI Monthly Verdict", margin, y);
      y += 5;
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...cGrayText);
      const vlines = pdf.splitTextToSize(aiReport.overallVerdict, pdfW - margin * 2);
      pdf.text(vlines, margin, y);
      y += vlines.length * 4.5 + 5;
    }

    if (aiReport.nextMonthFocus) {
      checkPageBreak(18);
      // Soft light-indigo alert box for action plan
      pdf.setFillColor(243, 244, 255);
      pdf.setDrawColor(224, 231, 255);
      pdf.roundedRect(margin, y, pdfW - margin * 2, 13, 1, 1, "FD");

      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...cIndigo);
      pdf.text("Next Month Action Plan ->", margin + 4, y + 5);

      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...cCharcoal);
      const flines = pdf.splitTextToSize(aiReport.nextMonthFocus, pdfW - margin * 2 - 8);
      pdf.text(flines, margin + 4, y + 10);
      y += 17;
    }
  }

  // ── Footer ───────────────────────────────────────────────────
  pdf.setFontSize(7.5);
  pdf.setTextColor(...cGrayText);
  pdf.text("Powered by Grok AI · FinWise AI", pdfW / 2, pdfH - 7, { align: "center" });

  pdf.save(`${filename}.pdf`);
}
