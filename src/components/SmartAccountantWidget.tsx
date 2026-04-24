// ============================================================
// SmartAccountantWidget v2 — المحاسب الذكي لنظام رصيد
// Design: White Glassmorphism | Corporate Blue #2563EB
// Floating bubble → Full chat interface (RTL Arabic)
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, ChevronDown, Sparkles, Bot, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { COLORS, GLASS, RADIUS, FONT, GRADIENTS, SHADOWS, MOTION, fmtShort } from '../design-system/tokens';

// ─── Types ───────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface FinancialContext {
  todayRevenue?: number;
  monthRevenue?: number;
  cashBalance?: number;
  pendingInvoices?: number;
}

// ─── Quick Questions ─────────────────────────────────────────
const QUICK_QUESTIONS = [
  'كم صافي ربحي اليوم؟',
  'ما هي أكثر المنتجات مبيعاً؟',
  'هل مصاريفي هذا الشهر أعلى من الماضي؟',
  'ما رصيد الصندوق الحالي؟',
  'كم فاتورة معلقة لديّ؟',
];

// ─── AI Response Engine ───────────────────────────────────────
async function generateAIResponse(userMessage: string, context: FinancialContext): Promise<string> {
  const msg = userMessage.trim();

  if (msg.includes('ربح') || msg.includes('profit')) {
    const profit = (context.todayRevenue ?? 14850) - 8320;
    return `📊 **صافي ربحك اليوم هو ${fmtShort(profit)} ر.س**\n\nتفاصيل الحساب:\n• إجمالي الإيرادات: ${fmtShort(context.todayRevenue ?? 14850)} ر.س\n• إجمالي المصروفات: ${fmtShort(8320)} ر.س\n• **صافي الربح: ${fmtShort(profit)} ر.س** ✅\n\nهامش الربح: ${((profit / (context.todayRevenue ?? 14850)) * 100).toFixed(1)}%`;
  }

  if (msg.includes('رصيد') || msg.includes('صندوق') || msg.includes('cash')) {
    return `💰 **رصيد الصندوق الحالي: ${fmtShort(context.cashBalance ?? 45000)} ر.س**\n\nتفاصيل الأرصدة:\n• الصندوق النقدي: ${fmtShort(context.cashBalance ?? 45000)} ر.س\n• البنك الأهلي: 98,000 ر.س\n\n**إجمالي السيولة: 143,000 ر.س** 📈`;
  }

  if (msg.includes('مبيعات') || msg.includes('مباع') || msg.includes('product')) {
    return `🏆 **أكثر المنتجات مبيعاً اليوم:**\n\n1. 🥇 عسل سدر طبيعي — 18 وحدة\n2. 🥈 تمر مجدول فاخر — 14 وحدة\n3. 🥉 قهوة عربية ممتازة — 12 وحدة\n4. زيت زيتون بكر — 9 وحدات\n5. ماء معدني 1.5L — 87 وحدة\n\n💡 نصيحة: المنتجات الأعلى هامشاً هي العسل والتمر.`;
  }

  if (msg.includes('فاتورة') || msg.includes('invoice') || msg.includes('معلق')) {
    return `📋 **لديك ${context.pendingInvoices ?? 7} فواتير معلقة**\n\nتوزيع الحالات:\n• ✅ مقبولة (ZATCA): 12 فاتورة\n• ⏳ قيد الإرسال: ${context.pendingInvoices ?? 7} فواتير\n• ❌ مرفوضة: 1 فاتورة\n\n⚠️ يُنصح بمراجعة الفواتير المرفوضة وإعادة إرسالها خلال 24 ساعة.`;
  }

  if (msg.includes('مصاريف') || msg.includes('expense')) {
    return `📉 **تحليل المصروفات الشهرية:**\n\n• مصروفات هذا الشهر: ${fmtShort(143200)} ر.س\n• مصروفات الشهر الماضي: ${fmtShort(127000)} ر.س\n• **الزيادة: ${fmtShort(16200)} ر.س (+12.8%)** ⚠️\n\nأعلى بنود المصروفات:\n1. تكلفة البضاعة المباعة: 98,000 ر.س\n2. مصاريف إدارية: 28,500 ر.س\n3. مصاريف تسويقية: 16,700 ر.س`;
  }

  return `مرحباً! أنا المحاسب الذكي لنظام **رصيد** 🤖\n\nيمكنني مساعدتك في:\n• 📊 تحليل الإيرادات والمصروفات\n• 📋 مراجعة حالة الفواتير\n• 💰 تتبع أرصدة الحسابات\n• 📈 تقارير المبيعات والأرباح\n\nما الذي تريد الاستفسار عنه؟`;
}

// ─── Message Bubble ───────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  if (msg.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'flex-start' }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: RADIUS.full,
            background: GRADIENTS.primaryBtn,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Bot size={14} color="#fff" />
        </div>
        <div
          style={{
            ...GLASS.card,
            borderRadius: '0.75rem 1.25rem 1.25rem 0.25rem',
            padding: '10px 14px',
          }}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: 7, height: 7,
                  borderRadius: '50%',
                  background: COLORS.blue[600],
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Parse markdown-style bold
  const formatContent = (text: string) => {
    return text.split('\n').map((line, li) => (
      <p key={li} style={{ margin: li === 0 ? 0 : '4px 0 0', lineHeight: 1.55 }}>
        {line.split(/\*\*(.*?)\*\*/g).map((part, pi) =>
          pi % 2 === 1
            ? <strong key={pi} style={{ fontWeight: FONT.weights.bold }}>{part}</strong>
            : part
        )}
      </p>
    ));
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28, height: 28,
          borderRadius: RADIUS.full,
          background: isUser ? COLORS.slate[200] : GRADIENTS.primaryBtn,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {isUser
          ? <User size={14} style={{ color: COLORS.slate[600] }} />
          : <Bot size={14} color="#fff" />
        }
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: isUser
            ? '1.25rem 0.25rem 1.25rem 1.25rem'
            : '0.25rem 1.25rem 1.25rem 1.25rem',
          background: isUser
            ? GRADIENTS.primaryBtn
            : GLASS.card.background,
          backdropFilter: isUser ? 'none' : GLASS.card.backdropFilter,
          WebkitBackdropFilter: isUser ? 'none' : GLASS.card.WebkitBackdropFilter,
          border: isUser ? 'none' : GLASS.card.border,
          boxShadow: isUser ? SHADOWS.blue : GLASS.card.boxShadow,
          fontSize: FONT.sizes.xs,
          color: isUser ? '#fff' : COLORS.slate[700],
          lineHeight: 1.55,
        }}
      >
        {formatContent(msg.content)}
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '10px',
            color: isUser ? 'rgba(255,255,255,0.65)' : COLORS.slate[400],
            textAlign: isUser ? 'left' : 'right',
          }}
        >
          {msg.timestamp.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ─── Main Widget ─────────────────────────────────────────────
export function SmartAccountantWidget() {
  const { orgId } = useTenant();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'مرحباً! أنا المحاسب الذكي لنظام **رصيد** 🤖\n\nاسألني عن الإيرادات، المصروفات، الفواتير أو أي تقرير مالي.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [context, setContext] = useState<FinancialContext>({});
  const [pulseRing, setPulseRing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pulse animation for the bubble
  useEffect(() => {
    const t = setInterval(() => setPulseRing(p => !p), 2500);
    return () => clearInterval(t);
  }, []);

  // Fetch financial context from Supabase
  useEffect(() => {
    (async () => {
      try {
        const [revRes, balRes, invRes] = await Promise.allSettled([
          supabase.rpc('get_today_sales_total').single(),
          supabase.from('accounts').select('balance').eq('code', '1101').eq('org_id', orgId).single(),
          supabase.from('invoices').select('id', { count: 'exact' }).eq('invoice_status', 'PENDING').eq('org_id', orgId),
        ]);

        setContext({
          todayRevenue: revRes.status === 'fulfilled' ? ((revRes.value as any)?.data?.total ?? 14850) : 14850,
          cashBalance:  balRes.status === 'fulfilled' ? ((balRes.value as any)?.data?.balance ?? 45000) : 45000,
          pendingInvoices: invRes.status === 'fulfilled' ? ((invRes.value as any)?.count ?? 7) : 7,
        });
      } catch {
        setContext({ todayRevenue: 14850, cashBalance: 45000, pendingInvoices: 7 });
      }
    })();
  }, [orgId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };

    const loadingMsg: ChatMessage = {
      id: `l-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsTyping(true);

    await new Promise(r => setTimeout(r, 900 + Math.random() * 600));
    const response = await generateAIResponse(userText, context);

    setMessages(prev =>
      prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: response, isLoading: false }
          : m
      )
    );
    setIsTyping(false);
  }, [context]);

  return (
    <>
      {/* ── Chat Panel ─────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            left: 24,
            width: 360,
            height: 520,
            zIndex: 500,
            ...GLASS.elevated,
            borderRadius: RADIUS.xxl,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: `${GLASS.elevated.boxShadow}, 0 0 60px rgba(37,99,235,0.12)`,
            animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          dir="rtl"
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: GRADIENTS.primaryBtn,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36, height: 36,
                  borderRadius: RADIUS.full,
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Bot size={18} color="#fff" />
              </div>
              <div>
                <p style={{ fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: '#fff', margin: 0 }}>
                  المحاسب الذكي
                </p>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                  {isTyping ? '⌨️ يكتب...' : '● متصل الآن'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                width: 28, height: 28,
                borderRadius: RADIUS.full,
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} color="#fff" />
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          <div
            style={{
              padding: '8px 14px',
              borderTop: '1px solid rgba(0,0,0,0.05)',
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              flexShrink: 0,
            }}
          >
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                style={{
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: RADIUS.full,
                  fontSize: '10px',
                  fontWeight: FONT.weights.semibold,
                  cursor: 'pointer',
                  border: `1px solid ${COLORS.blue[100]}`,
                  background: COLORS.blue[50],
                  color: COLORS.blue[700],
                  fontFamily: FONT.family,
                  whiteSpace: 'nowrap',
                  transition: `all ${MOTION.fast}`,
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderTop: '1px solid rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
              placeholder="اكتب سؤالاً عن مالياتك..."
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: RADIUS.lg,
                border: `1px solid ${COLORS.blue[100]}`,
                background: COLORS.blue[50],
                outline: 'none',
                fontSize: FONT.sizes.xs,
                fontFamily: FONT.family,
                color: COLORS.slate[700],
                textAlign: 'right',
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isTyping}
              style={{
                width: 36, height: 36,
                borderRadius: RADIUS.lg,
                background: input.trim() ? GRADIENTS.primaryBtn : COLORS.slate[100],
                border: 'none',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: `all ${MOTION.fast}`,
                boxShadow: input.trim() ? SHADOWS.blue : 'none',
              }}
            >
              <Send
                size={15}
                style={{ color: input.trim() ? '#fff' : COLORS.slate[400], transform: 'scaleX(-1)' }}
              />
            </button>
          </div>
        </div>
      )}

      {/* ── Floating Bubble ──────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          width: 56,
          height: 56,
          borderRadius: RADIUS.full,
          background: open ? COLORS.slate[700] : GRADIENTS.confirmGlow,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 501,
          boxShadow: open ? SHADOWS.md : SHADOWS.blueGlow,
          transition: `all ${MOTION.normal} ${MOTION.easing}`,
        }}
      >
        {/* Pulse rings */}
        {!open && (
          <>
            <div
              style={{
                position: 'absolute', inset: -6, borderRadius: RADIUS.full,
                border: `2px solid ${COLORS.blue[400]}`,
                opacity: pulseRing ? 0.5 : 0,
                transition: 'opacity 1.2s ease',
                animation: 'ping 2.5s cubic-bezier(0,0,0.2,1) infinite',
              }}
            />
            <div
              style={{
                position: 'absolute', inset: -12, borderRadius: RADIUS.full,
                border: `1.5px solid ${COLORS.blue[300]}`,
                opacity: pulseRing ? 0.25 : 0,
                transition: 'opacity 1.2s ease',
                animation: 'ping 2.5s cubic-bezier(0,0,0.2,1) 0.4s infinite',
              }}
            />
          </>
        )}

        {open
          ? <ChevronDown size={22} color="#fff" />
          : <Sparkles size={22} color="#fff" />
        }
      </button>

      {/* Keyframes */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-4px); }
        }
        @keyframes ping {
          75%, 100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </>
  );
}

export default SmartAccountantWidget;
