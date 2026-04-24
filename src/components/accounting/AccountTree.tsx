// ============================================================
// Control Panel (رصيد) — Recursive Account Tree Component v2
// Design: White Glassmorphism | Corporate Blue | Collapsible
// Features: Hierarchy lines, codes, balances, animations
// ============================================================

import { useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronDown, Plus,
  TrendingUp, TrendingDown, Scale, Building2,
  CreditCard, Minus,
} from 'lucide-react';
import { COLORS, RADIUS, FONT, MOTION } from '../../design-system/tokens';

// ─── Types ───────────────────────────────────────────────────
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  balance: number;
  parent_id: string | null;
  children: AccountNode[];
  is_header: boolean;
  level: number;
}

interface AccountTreeProps {
  accounts: AccountNode[];
  onSelect?: (account: AccountNode) => void;
  selectedId?: string;
  onAddChild?: (parentId: string) => void;
  currency?: string;
}

// ─── Type Config ─────────────────────────────────────────────
const TYPE_CONFIG: Record<AccountType, {
  color: string;
  bg: string;
  label: string;
  icon: React.ElementType;
}> = {
  ASSET:     { color: COLORS.blue[600],       bg: COLORS.blue[50],         label: 'أصول',       icon: Building2   },
  LIABILITY: { color: COLORS.rose.DEFAULT,    bg: COLORS.rose.light,       label: 'خصوم',       icon: CreditCard  },
  EQUITY:    { color: '#8b5cf6',              bg: 'rgba(139,92,246,0.08)', label: 'حقوق ملكية', icon: Scale       },
  REVENUE:   { color: COLORS.emerald.DEFAULT, bg: COLORS.emerald.light,    label: 'إيرادات',    icon: TrendingUp  },
  EXPENSE:   { color: COLORS.amber.DEFAULT,   bg: COLORS.amber.light,      label: 'مصروفات',    icon: TrendingDown },
};

const fmtSAR = (n: number) =>
  `${Math.abs(n).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`;

// ─── Account Row ─────────────────────────────────────────────
interface AccountRowProps {
  account: AccountNode;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onAddChild?: () => void;
  isLast: boolean;
  parentExpanded?: boolean;
}

function AccountRow({
  account,
  depth,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  onAddChild,
  isLast,
}: AccountRowProps) {
  const [hovered, setHovered] = useState(false);
  const cfg = TYPE_CONFIG[account.type];
  const TypeIcon = cfg.icon;
  const hasChildren = account.children.length > 0;
  const indentPx = depth * 20;
  const isNegative = account.balance < 0;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hierarchy vertical line */}
      {depth > 0 && (
        <div
          style={{
            position: 'absolute',
            right: indentPx - 12,
            top: 0,
            bottom: isLast ? '50%' : 0,
            width: 1,
            background: 'rgba(0,0,0,0.08)',
          }}
        />
      )}
      {/* Horizontal connector */}
      {depth > 0 && (
        <div
          style={{
            position: 'absolute',
            right: indentPx - 12,
            top: '50%',
            width: 10,
            height: 1,
            background: 'rgba(0,0,0,0.08)',
          }}
        />
      )}

      <div
        onClick={onSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: `${depth === 0 ? '12px' : '8px'} 14px`,
          paddingRight: `${indentPx + 14}px`,
          borderRadius: RADIUS.lg,
          cursor: 'pointer',
          background: isSelected
            ? `${COLORS.blue[600]}10`
            : hovered
            ? 'rgba(0,0,0,0.025)'
            : 'transparent',
          border: isSelected
            ? `1px solid ${COLORS.blue[600]}20`
            : '1px solid transparent',
          transition: `all ${MOTION.fast} ${MOTION.easing}`,
          position: 'relative',
        }}
      >
        {/* Expand/Collapse toggle */}
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); onToggle(); }}
            style={{
              width: 20, height: 20,
              borderRadius: RADIUS.sm,
              background: isExpanded ? `${cfg.color}15` : 'rgba(0,0,0,0.06)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: `all ${MOTION.fast}`,
            }}
          >
            {isExpanded
              ? <ChevronDown size={11} style={{ color: cfg.color }} />
              : <ChevronLeft size={11} style={{ color: COLORS.slate[400] }} />
            }
          </button>
        ) : (
          <div
            style={{
              width: 20, height: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Minus size={10} style={{ color: 'rgba(0,0,0,0.15)' }} />
          </div>
        )}

        {/* Type icon */}
        <div
          style={{
            width: depth === 0 ? 32 : 26,
            height: depth === 0 ? 32 : 26,
            borderRadius: RADIUS.sm,
            background: cfg.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <TypeIcon size={depth === 0 ? 14 : 12} style={{ color: cfg.color }} />
        </div>

        {/* Account Code */}
        <span
          style={{
            fontSize: FONT.sizes.xs,
            fontFamily: 'monospace',
            color: isSelected ? COLORS.blue[600] : COLORS.slate[400],
            minWidth: depth === 0 ? 44 : 36,
            fontWeight: FONT.weights.semibold,
          }}
        >
          {account.code}
        </span>

        {/* Account Name */}
        <span
          style={{
            flex: 1,
            fontSize: depth === 0 ? FONT.sizes.base : FONT.sizes.sm,
            fontWeight: depth === 0 ? FONT.weights.bold : (account.is_header ? FONT.weights.semibold : FONT.weights.medium),
            color: isSelected ? COLORS.slate[800] : COLORS.slate[700],
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {account.name}
        </span>

        {/* Children count */}
        {hasChildren && (
          <span
            style={{
              fontSize: '10px',
              color: COLORS.slate[400],
              background: 'rgba(0,0,0,0.05)',
              padding: '1px 6px',
              borderRadius: RADIUS.full,
            }}
          >
            {account.children.length}
          </span>
        )}

        {/* Balance */}
        <div style={{ textAlign: 'left', flexShrink: 0 }}>
          <p
            style={{
              fontSize: depth === 0 ? FONT.sizes.base : FONT.sizes.sm,
              fontWeight: FONT.weights.bold,
              color: isNegative ? COLORS.rose.DEFAULT : COLORS.slate[800],
              margin: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isNegative && '('}
            {fmtSAR(account.balance)}
            {isNegative && ')'}
          </p>
        </div>

        {/* Add child button (hover only) */}
        {hovered && onAddChild && (
          <button
            onClick={e => { e.stopPropagation(); onAddChild(); }}
            style={{
              width: 24, height: 24,
              borderRadius: RADIUS.sm,
              background: COLORS.blue[50],
              border: `1px solid ${COLORS.blue[100]}`,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: `all ${MOTION.fast}`,
            }}
            title="إضافة حساب فرعي"
          >
            <Plus size={12} style={{ color: COLORS.blue[600] }} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Recursive Account Tree ───────────────────────────────────
interface RecursiveTreeProps {
  accounts: AccountNode[];
  depth: number;
  selectedId?: string;
  onSelect?: (account: AccountNode) => void;
  onAddChild?: (parentId: string) => void;
}

function RecursiveTree({ accounts, depth, selectedId, onSelect, onAddChild }: RecursiveTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Level 0 and 1 auto-expanded
    const init: Record<string, boolean> = {};
    accounts.forEach(a => { if (depth <= 1) init[a.id] = true; });
    return init;
  });

  const toggle = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {accounts.map((account, i) => {
        const isOpen = expanded[account.id] ?? (depth <= 1);
        const isLast = i === accounts.length - 1;

        return (
          <div key={account.id}>
            <AccountRow
              account={account}
              depth={depth}
              isSelected={selectedId === account.id}
              isExpanded={isOpen}
              onSelect={() => onSelect?.(account)}
              onToggle={() => toggle(account.id)}
              onAddChild={onAddChild ? () => onAddChild(account.id) : undefined}
              isLast={isLast}
            />

            {/* Children (collapsible) */}
            {account.children.length > 0 && isOpen && (
              <div
                style={{
                  overflow: 'hidden',
                  maxHeight: isOpen ? '9999px' : 0,
                  transition: `max-height ${MOTION.slow} ${MOTION.easing}`,
                }}
              >
                <RecursiveTree
                  accounts={account.children}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onAddChild={onAddChild}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Balance Equation Banner ──────────────────────────────────
function BalanceEquation({ accounts }: { accounts: AccountNode[] }) {
  const assets     = accounts.filter(a => a.type === 'ASSET').reduce((s, a) => s + a.balance, 0);
  const liabilities= accounts.filter(a => a.type === 'LIABILITY').reduce((s, a) => s + a.balance, 0);
  const equity     = accounts.filter(a => a.type === 'EQUITY').reduce((s, a) => s + a.balance, 0);
  const balanced   = Math.abs(assets - (liabilities + equity)) < 0.01;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '12px 20px',
        borderRadius: RADIUS.xl,
        background: balanced
          ? COLORS.emerald.light
          : COLORS.rose.light,
        border: `1px solid ${balanced ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`,
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <EquationItem label="الأصول" value={assets} color={COLORS.blue[600]} />
      <span style={{ fontSize: FONT.sizes.xl, color: COLORS.slate[400], fontWeight: FONT.weights.black }}>=</span>
      <EquationItem label="الخصوم" value={liabilities} color={COLORS.rose.DEFAULT} />
      <span style={{ fontSize: FONT.sizes.lg, color: COLORS.slate[400], fontWeight: FONT.weights.bold }}>+</span>
      <EquationItem label="حقوق الملكية" value={equity} color="#8b5cf6" />
      <div
        style={{
          marginRight: 'auto',
          fontSize: FONT.sizes.xs,
          fontWeight: FONT.weights.bold,
          color: balanced ? COLORS.emerald.DEFAULT : COLORS.rose.DEFAULT,
        }}
      >
        {balanced ? '✓ الميزانية متوازنة' : '✗ الميزانية غير متوازنة'}
      </div>
    </div>
  );
}

function EquationItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: FONT.sizes.xs, color: COLORS.slate[500], margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: FONT.sizes.base, fontWeight: FONT.weights.black, color, margin: 0 }}>
        {fmtSAR(value)}
      </p>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────
function SectionHeader({ type, accounts }: { type: AccountType; accounts: AccountNode[] }) {
  const cfg = TYPE_CONFIG[type];
  const TypeIcon = cfg.icon;
  const total = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: RADIUS.lg,
        background: `${cfg.color}08`,
        border: `1px solid ${cfg.color}18`,
        marginTop: '0.5rem',
        marginBottom: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28, height: 28,
            borderRadius: RADIUS.sm,
            background: cfg.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <TypeIcon size={13} style={{ color: cfg.color }} />
        </div>
        <span style={{ fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: COLORS.slate[700] }}>
          {cfg.label}
        </span>
      </div>
      <span style={{ fontSize: FONT.sizes.sm, fontWeight: FONT.weights.black, color: cfg.color }}>
        {fmtSAR(total)}
      </span>
    </div>
  );
}

// ─── Main AccountTree Export ──────────────────────────────────
export function AccountTree({ accounts, onSelect, selectedId, onAddChild }: AccountTreeProps) {
  // Group by type
  const byType = (type: AccountType) => accounts.filter(a => a.type === type);
  const typeOrder: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

  // Flat list for balance equation
  const flatAll = (node: AccountNode): AccountNode[] =>
    [node, ...node.children.flatMap(flatAll)];
  const flat = accounts.flatMap(flatAll);

  return (
    <div style={{ fontFamily: FONT.family, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Balance Equation */}
      <BalanceEquation accounts={flat} />

      {/* Tree by type sections */}
      {typeOrder.map(type => {
        const group = byType(type);
        if (!group.length) return null;
        return (
          <div key={type}>
            <SectionHeader type={type} accounts={flat.filter(a => a.type === type)} />
            <RecursiveTree
              accounts={group}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Mock data for standalone preview ────────────────────────
export const MOCK_ACCOUNTS: AccountNode[] = [
  {
    id: '1', code: '1', name: 'الأصول', type: 'ASSET', balance: 245800, parent_id: null, is_header: true, level: 0,
    children: [
      {
        id: '11', code: '11', name: 'الأصول المتداولة', type: 'ASSET', balance: 185000, parent_id: '1', is_header: true, level: 1,
        children: [
          { id: '1101', code: '1101', name: 'الصندوق', type: 'ASSET', balance: 45000, parent_id: '11', is_header: false, level: 2, children: [] },
          { id: '1102', code: '1102', name: 'البنك الأهلي', type: 'ASSET', balance: 98000, parent_id: '11', is_header: false, level: 2, children: [] },
          { id: '1103', code: '1103', name: 'العملاء', type: 'ASSET', balance: 42000, parent_id: '11', is_header: false, level: 2, children: [] },
        ],
      },
      {
        id: '12', code: '12', name: 'الأصول الثابتة', type: 'ASSET', balance: 60800, parent_id: '1', is_header: true, level: 1,
        children: [
          { id: '1201', code: '1201', name: 'الأثاث والمعدات', type: 'ASSET', balance: 75000, parent_id: '12', is_header: false, level: 2, children: [] },
          { id: '1202', code: '1202', name: 'مجمع الاستهلاك', type: 'ASSET', balance: -14200, parent_id: '12', is_header: false, level: 2, children: [] },
        ],
      },
    ],
  },
  {
    id: '2', code: '2', name: 'الخصوم', type: 'LIABILITY', balance: 128400, parent_id: null, is_header: true, level: 0,
    children: [
      { id: '2101', code: '2101', name: 'الموردون', type: 'LIABILITY', balance: 65000, parent_id: '2', is_header: false, level: 1, children: [] },
      { id: '2102', code: '2102', name: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', balance: 38400, parent_id: '2', is_header: false, level: 1, children: [] },
      { id: '2103', code: '2103', name: 'مستحقات أخرى', type: 'LIABILITY', balance: 25000, parent_id: '2', is_header: false, level: 1, children: [] },
    ],
  },
  {
    id: '3', code: '3', name: 'حقوق الملكية', type: 'EQUITY', balance: 117400, parent_id: null, is_header: true, level: 0,
    children: [
      { id: '3101', code: '3101', name: 'رأس المال', type: 'EQUITY', balance: 100000, parent_id: '3', is_header: false, level: 1, children: [] },
      { id: '3102', code: '3102', name: 'الأرباح المبقاة', type: 'EQUITY', balance: 17400, parent_id: '3', is_header: false, level: 1, children: [] },
    ],
  },
  {
    id: '4', code: '4', name: 'الإيرادات', type: 'REVENUE', balance: 256000, parent_id: null, is_header: true, level: 0,
    children: [
      { id: '4101', code: '4101', name: 'إيرادات المبيعات', type: 'REVENUE', balance: 238000, parent_id: '4', is_header: false, level: 1, children: [] },
      { id: '4102', code: '4102', name: 'إيرادات أخرى', type: 'REVENUE', balance: 18000, parent_id: '4', is_header: false, level: 1, children: [] },
    ],
  },
  {
    id: '5', code: '5', name: 'المصروفات', type: 'EXPENSE', balance: 143200, parent_id: null, is_header: true, level: 0,
    children: [
      { id: '5101', code: '5101', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', balance: 98000, parent_id: '5', is_header: false, level: 1, children: [] },
      { id: '5102', code: '5102', name: 'مصاريف إدارية وعمومية', type: 'EXPENSE', balance: 28500, parent_id: '5', is_header: false, level: 1, children: [] },
      { id: '5103', code: '5103', name: 'مصاريف تسويقية', type: 'EXPENSE', balance: 16700, parent_id: '5', is_header: false, level: 1, children: [] },
    ],
  },
];

export default AccountTree;
