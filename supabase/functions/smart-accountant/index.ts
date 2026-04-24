// ============================================================
// smart-accountant — Supabase Edge Function
// نظام رصيد | محاسب ذكي متخصص بالمعايير السعودية ZATCA
// Runtime: Deno | AI: Claude (Anthropic)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// ─── CORS Headers ─────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── نموذج البيانات المالية الملخصة ─────────────────────────────
interface FinancialSummary {
  today_revenue: number;
  yesterday_revenue: number;
  this_month_revenue: number;
  last_month_revenue: number;
  this_month_vat: number;
  total_invoices_this_month: number;
  pending_invoices_count: number;
  draft_invoices_count: number;
  cleared_invoices_count: number;
  this_month_expenses: number;
  last_month_expenses: number;
  this_month_net_profit: number;
  last_month_net_profit: number;
  top_selling_products: Array<{ name: string; quantity: number }>;
  low_stock_products: Array<{ name: string; stock: number; min_stock: number }>;
  cash_balance: number;
  accounts_receivable: number;
  total_assets_approx: number;
  report_date: string;
  report_month: string;
}

// ─── جلب الملخص المالي من Supabase ──────────────────────────────
async function fetchFinancialSummary(supabase: any): Promise<FinancialSummary> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thisMonth = now.toISOString().slice(0, 7);

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // ── تشغيل الاستعلامات بالتوازي ───────────────────────────────
  const [
    todayRevRes,
    yesterdayRevRes,
    thisMonthRevRes,
    lastMonthRevRes,
    pendingRes,
    draftRes,
    clearedRes,
    thisMonthExpRes,
    lastMonthExpRes,
    topProductsRes,
    lowStockRes,
  ] = await Promise.allSettled([
    supabase
      .from("invoices")
      .select("total_amount, vat_amount, taxable_amount")
      .in("invoice_status", ["CLEARED", "REPORTED"])
      .eq("issue_date", today),

    supabase
      .from("invoices")
      .select("total_amount")
      .in("invoice_status", ["CLEARED", "REPORTED"])
      .eq("issue_date", yesterdayStr),

    supabase
      .from("invoices")
      .select("total_amount, vat_amount, taxable_amount")
      .in("invoice_status", ["CLEARED", "REPORTED"])
      .like("issue_date", `${thisMonth}%`),

    supabase
      .from("invoices")
      .select("total_amount, taxable_amount")
      .in("invoice_status", ["CLEARED", "REPORTED"])
      .like("issue_date", `${lastMonth}%`),

    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("invoice_status", "PENDING"),

    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("invoice_status", "DRAFT"),

    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("invoice_status", ["CLEARED", "REPORTED"])
      .like("issue_date", `${thisMonth}%`),

    supabase
      .from("expenses")
      .select("amount")
      .like("expense_date", `${thisMonth}%`),

    supabase
      .from("expenses")
      .select("amount")
      .like("expense_date", `${lastMonth}%`),

    supabase
      .from("invoice_lines")
      .select("item_name_ar, quantity")
      .order("quantity", { ascending: false })
      .limit(5),

    supabase
      .from("products")
      .select("name_ar, stock_qty, min_stock_qty")
      .filter("stock_qty", "lte", "min_stock_qty")
      .limit(5),
  ]);

  // ── دوال استخراج المجاميع ─────────────────────────────────────
  const sumField = (res: PromiseSettledResult<any>, field: string): number => {
    if (res.status !== "fulfilled") return 0;
    return (res.value.data ?? []).reduce(
      (s: number, r: any) => s + +(r[field] ?? 0),
      0
    );
  };

  const getCount = (res: PromiseSettledResult<any>): number =>
    res.status === "fulfilled" ? res.value.count ?? 0 : 0;

  // ── استخراج أرصدة الحسابات من الـ Ledger ─────────────────────
  let cash_balance = 0;
  let accounts_receivable = 0;

  try {
    const [cashAccRes, arAccRes] = await Promise.allSettled([
      supabase.from("accounts").select("id").eq("code", "1100").single(),
      supabase.from("accounts").select("id").eq("code", "1200").single(),
    ]);

    if (cashAccRes.status === "fulfilled" && cashAccRes.value.data?.id) {
      const { data: cashLedger } = await supabase
        .from("ledger")
        .select("debit, credit")
        .eq("account_id", cashAccRes.value.data.id);
      cash_balance = (cashLedger ?? []).reduce(
        (s: number, r: any) => s + +(r.debit ?? 0) - +(r.credit ?? 0),
        0
      );
    }

    if (arAccRes.status === "fulfilled" && arAccRes.value.data?.id) {
      const { data: arLedger } = await supabase
        .from("ledger")
        .select("debit, credit")
        .eq("account_id", arAccRes.value.data.id);
      accounts_receivable = (arLedger ?? []).reduce(
        (s: number, r: any) => s + +(r.debit ?? 0) - +(r.credit ?? 0),
        0
      );
    }
  } catch (_) {
    // تجاهل خطأ الأرصدة واستمر
  }

  const this_month_taxable = sumField(thisMonthRevRes, "taxable_amount");
  const last_month_taxable = sumField(lastMonthRevRes, "taxable_amount");
  const this_month_expenses = sumField(thisMonthExpRes, "amount");
  const last_month_expenses = sumField(lastMonthExpRes, "amount");

  return {
    today_revenue: sumField(todayRevRes, "total_amount"),
    yesterday_revenue: sumField(yesterdayRevRes, "total_amount"),
    this_month_revenue: sumField(thisMonthRevRes, "total_amount"),
    last_month_revenue: sumField(lastMonthRevRes, "total_amount"),
    this_month_vat: sumField(thisMonthRevRes, "vat_amount"),
    total_invoices_this_month: getCount(clearedRes),
    pending_invoices_count: getCount(pendingRes),
    draft_invoices_count: getCount(draftRes),
    cleared_invoices_count: getCount(clearedRes),
    this_month_expenses,
    last_month_expenses,
    this_month_net_profit: this_month_taxable - this_month_expenses,
    last_month_net_profit: last_month_taxable - last_month_expenses,
    top_selling_products:
      topProductsRes.status === "fulfilled"
        ? (topProductsRes.value.data ?? []).map((p: any) => ({
            name: p.item_name_ar ?? "—",
            quantity: +(p.quantity ?? 0),
          }))
        : [],
    low_stock_products:
      lowStockRes.status === "fulfilled"
        ? (lowStockRes.value.data ?? []).map((p: any) => ({
            name: p.name_ar ?? "—",
            stock: +(p.stock_qty ?? 0),
            min_stock: +(p.min_stock_qty ?? 0),
          }))
        : [],
    cash_balance,
    accounts_receivable,
    total_assets_approx: cash_balance + accounts_receivable,
    report_date: today,
    report_month: thisMonth,
  };
}

// ─── بناء System Prompt المحاسب السعودي ──────────────────────────
function buildSystemPrompt(summary: FinancialSummary): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("ar-SA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const topProducts =
    summary.top_selling_products
      .map((p) => `${p.name} (${p.quantity} وحدة)`)
      .join("، ") || "لا توجد بيانات";

  const lowStock =
    summary.low_stock_products
      .map((p) => `${p.name}: متبقي ${p.stock} (حد أدنى ${p.min_stock})`)
      .join("، ") || "لا توجد تنبيهات";

  const expChg =
    summary.last_month_expenses > 0
      ? (
          ((summary.this_month_expenses - summary.last_month_expenses) /
            summary.last_month_expenses) *
          100
        ).toFixed(1)
      : "0";

  const revChg =
    summary.last_month_revenue > 0
      ? (
          ((summary.this_month_revenue - summary.last_month_revenue) /
            summary.last_month_revenue) *
          100
        ).toFixed(1)
      : "0";

  return `أنت "المحاسب الذكي" — مستشار مالي وخبير محاسبة سعودي لنظام رصيد السحابي.

══ هويتك ══
• خبير محاسب قانوني معتمد مع خبرة عميقة في السوق السعودي
• ملم بأنظمة هيئة الزكاة والضريبة والجمارك (ZATCA) — المرحلة الثانية
• تفهم معايير SOCPA والمعايير الدولية IFRS
• لغتك: عربية احترافية مباشرة مع التاجر

══ بياناتك المالية الحية (${summary.report_date}) ══

📊 المبيعات:
• اليوم: ${fmt(summary.today_revenue)} ر.س | أمس: ${fmt(summary.yesterday_revenue)} ر.س
• هذا الشهر: ${fmt(summary.this_month_revenue)} ر.س (${Number(revChg) >= 0 ? "↑" : "↓"} ${Math.abs(Number(revChg))}% عن الشهر الماضي)
• الشهر الماضي: ${fmt(summary.last_month_revenue)} ر.س
• ضريبة القيمة المضافة هذا الشهر: ${fmt(summary.this_month_vat)} ر.س

🧾 الفواتير (${summary.report_month}):
• مسواة/معتمدة: ${summary.cleared_invoices_count} | معلقة: ${summary.pending_invoices_count} | مسودات: ${summary.draft_invoices_count}

💸 المصروفات والأرباح:
• مصروفات هذا الشهر: ${fmt(summary.this_month_expenses)} ر.س (${Number(expChg) >= 0 ? "↑" : "↓"} ${Math.abs(Number(expChg))}% عن الشهر الماضي)
• صافي الربح هذا الشهر: ${fmt(summary.this_month_net_profit)} ر.س
• صافي ربح الشهر الماضي: ${fmt(summary.last_month_net_profit)} ر.س

📦 المخزون:
• الأكثر مبيعاً: ${topProducts}
• تنبيهات مخزون منخفض: ${lowStock}

🏦 الميزانية:
• رصيد الصندوق/البنك: ${fmt(summary.cash_balance)} ر.س
• الذمم المدينة: ${fmt(summary.accounts_receivable)} ر.س
• إجمالي الأصول (تقريبي): ${fmt(summary.total_assets_approx)} ر.س

══ قواعد الإجابة ══
1. استخدم الأرقام الحية أعلاه دائماً — لا تخمّن
2. إجابة مختصرة ومباشرة (3-5 أسطر في الغالب)
3. نبّه للمشاكل (خسارة، ارتفاع مصاريف، مخزون منخفض) بلطف
4. استشهد بقوانين ZATCA عند الحاجة للأحكام الضريبية
5. استخدم رموز تعبيرية باعتدال لتحسين القراءة
6. إذا البيانات صفر أو ناقصة، وضّح ذلك للتاجر واقترح الحل`;
}

// ══════════════════════════════════════════════════════════════
// ── الخادم الرئيسي
// ══════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const query: string = body.query ?? body.message ?? "";
    const clientContext = body.context ?? {};

    if (!query.trim()) {
      return new Response(
        JSON.stringify({ error: "لم يتم إرسال أي سؤال." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // ── تهيئة Supabase Admin ──────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // ── جلب البيانات المالية الحية ─────────────────────────────
    let financialSummary: FinancialSummary;
    try {
      financialSummary = await fetchFinancialSummary(supabaseAdmin);
    } catch (dbErr) {
      console.error("[smart-accountant] DB fetch failed:", dbErr);
      // Fallback إلى بيانات الـ Frontend
      financialSummary = {
        today_revenue: clientContext.todayRevenue ?? 0,
        yesterday_revenue: 0,
        this_month_revenue: clientContext.monthRevenue ?? 0,
        last_month_revenue: 0,
        this_month_vat: (clientContext.monthRevenue ?? 0) * 0.15,
        total_invoices_this_month: 0,
        pending_invoices_count: clientContext.pendingInvoices ?? 0,
        draft_invoices_count: 0,
        cleared_invoices_count: 0,
        this_month_expenses: 0,
        last_month_expenses: 0,
        this_month_net_profit: 0,
        last_month_net_profit: 0,
        top_selling_products: (clientContext.topProducts ?? []).map(
          (n: string) => ({ name: n, quantity: 0 })
        ),
        low_stock_products: [],
        cash_balance: clientContext.cashBalance ?? 0,
        accounts_receivable: 0,
        total_assets_approx: clientContext.cashBalance ?? 0,
        report_date: new Date().toISOString().slice(0, 10),
        report_month: new Date().toISOString().slice(0, 7),
      };
    }

    // ── تهيئة Claude ──────────────────────────────────────────
    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    });

    const systemPrompt = buildSystemPrompt(financialSummary);

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    });

    const reply =
      response.content[0].type === "text"
        ? response.content[0].text
        : "عذراً، لم أتمكن من معالجة طلبك.";

    return new Response(
      JSON.stringify({
        reply,
        financialSnapshot: {
          todayRevenue: financialSummary.today_revenue,
          monthRevenue: financialSummary.this_month_revenue,
          netProfit: financialSummary.this_month_net_profit,
          pendingInvoices: financialSummary.pending_invoices_count,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[smart-accountant] Error:", error);
    return new Response(
      JSON.stringify({
        error: "حدث خطأ أثناء معالجة البيانات.",
        detail: error?.message ?? "خطأ غير معروف",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
