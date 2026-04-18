import { useState } from 'react';
import { Plus, TrendingUp, DollarSign, Calendar, Trash2 } from 'lucide-react';

interface Expense {
  id: string;
  category: 'salary' | 'rent' | 'utilities' | 'supplies' | 'other';
  description: string;
  amount: number;
  date: string;
  notes: string;
}

const EXPENSE_CATEGORIES = {
  salary: { label: 'رواتب', icon: '👥', color: '#8b5cf6' },
  rent: { label: 'إيجار', icon: '🏢', color: '#3b82f6' },
  utilities: { label: 'فواتير', icon: '💡', color: '#06b6d4' },
  supplies: { label: 'مستلزمات', icon: '📦', color: '#f59e0b' },
  other: { label: 'أخرى', icon: '📝', color: '#64748b' },
};

export default function ExpensesSection() {
  const [expenses, setExpenses] = useState<Expense[]>([
    {
      id: '1',
      category: 'salary',
      description: 'رواتب الموظفين - يناير 2024',
      amount: 50000,
      date: '2024-01-01',
      notes: '',
    },
    {
      id: '2',
      category: 'rent',
      description: 'إيجار المحل الشهري',
      amount: 5000,
      date: '2024-01-05',
      notes: 'المحل الرئيسي في الحمراء',
    },
    {
      id: '3',
      category: 'utilities',
      description: 'فاتورة الكهرباء والمياه',
      amount: 1500,
      date: '2024-01-10',
      notes: '',
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    category: 'other' as Expense['category'],
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const handleAddExpense = () => {
    if (formData.description && formData.amount) {
      const newExpense: Expense = {
        id: Date.now().toString(),
        category: formData.category,
        description: formData.description,
        amount: Number(formData.amount),
        date: formData.date,
        notes: formData.notes,
      };
      setExpenses([...expenses, newExpense]);
      setFormData({
        category: 'other',
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setShowForm(false);
    }
  };

  const handleDelete = (id: string) => {
    setExpenses(expenses.filter((e) => e.id !== id));
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const categoryTotals = EXPENSE_CATEGORIES as any;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">المصروفات</h1>
          <p className="text-slate-500 mt-1">تتبع جميع المصاريف التشغيلية والرواتب</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-black transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            boxShadow: '0 4px 15px rgba(245,158,11,0.3)',
          }}
        >
          <Plus size={18} />
          مصروفٌ جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'إجمالي المصروفات',
            value: `ر.س ${totalExpenses.toLocaleString()}`,
            icon: DollarSign,
            color: '#ef4444',
          },
          {
            label: 'عدد المصروفات',
            value: expenses.length,
            icon: TrendingUp,
            color: '#f59e0b',
          },
          {
            label: 'الرواتب',
            value: `ر.س ${expenses
              .filter((e) => e.category === 'salary')
              .reduce((sum, e) => sum + e.amount, 0)
              .toLocaleString()}`,
            icon: null,
            color: '#8b5cf6',
          },
          {
            label: 'المتوسط اليومي',
            value: `ر.س ${Math.round(totalExpenses / 30).toLocaleString()}`,
            icon: Calendar,
            color: '#06b6d4',
          },
        ].map((stat, idx) => (
          <div
            key={idx}
            className="p-4 rounded-[2rem] border"
            style={{
              background: 'rgba(255,255,255,0.4)',
              borderColor: 'rgba(255,255,255,0.6)',
            }}
          >
            <p className="text-slate-600 text-sm mb-2">{stat.label}</p>
            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div
          className="p-6 rounded-[2.5rem] mb-6 border"
          style={{
            background: 'rgba(255,255,255,0.4)',
            backdropFilter: 'blur(24px)',
            borderColor: 'rgba(255,255,255,0.6)',
          }}
        >
          <h2 className="text-lg font-bold text-slate-900 mb-4">إضافة مصروفٍ جديد</h2>
          <div className="grid grid-cols-2 gap-4">
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as Expense['category'] })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {Object.entries(EXPENSE_CATEGORIES).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="text"
              placeholder="وصف المصروف"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="col-span-2 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="number"
              placeholder="المبلغ"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <textarea
              placeholder="ملاحظات (اختياري)"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="col-span-2 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right resize-none"
              rows={2}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAddExpense}
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-black transition-all"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}
            >
              إضافة
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-700 border border-slate-200 transition-all"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Expenses List */}
      <div className="space-y-3">
        {expenses.map((expense) => {
          const cat = EXPENSE_CATEGORIES[expense.category];
          return (
            <div
              key={expense.id}
              className="p-4 rounded-[2rem] border flex items-center justify-between group hover:shadow-lg transition-all"
              style={{
                background: 'rgba(255,255,255,0.4)',
                borderColor: 'rgba(255,255,255,0.6)',
              }}
            >
              <div className="flex items-center gap-4 flex-1">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                  style={{ background: `${cat.color}20` }}
                >
                  {cat.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900">{expense.description}</h3>
                    <span
                      className="text-xs px-2 py-1 rounded-lg font-medium"
                      style={{ background: `${cat.color}20`, color: cat.color }}
                    >
                      {cat.label}
                    </span>
                  </div>
                  {expense.notes && <p className="text-xs text-slate-500 mt-1">{expense.notes}</p>}
                  <p className="text-xs text-slate-400 mt-1">{expense.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-lg font-bold text-slate-900 whitespace-nowrap">
                  ر.س {expense.amount.toLocaleString()}
                </p>
                <button
                  onClick={() => handleDelete(expense.id)}
                  className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                >
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {expenses.length === 0 && !showForm && (
        <div
          className="text-center py-12 rounded-[2.5rem] border"
          style={{
            background: 'rgba(255,255,255,0.3)',
            borderColor: 'rgba(255,255,255,0.5)',
          }}
        >
          <p className="text-slate-500 mb-4">لم تقم بتسجيل أي مصروفات حتى الآن</p>
        </div>
      )}
    </div>
  );
}