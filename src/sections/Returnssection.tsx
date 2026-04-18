import { useState } from 'react';
import { Plus, ArrowLeftCircle, Calendar, User, DollarSign, Trash2 } from 'lucide-react';

interface Return {
  id: string;
  invoiceNumber: string;
  customerName: string;
  items: string;
  reason: string;
  returnAmount: number;
  originalDate: string;
  returnDate: string;
  status: 'pending' | 'approved' | 'refunded' | 'rejected';
}

const STATUS_COLORS = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'قيد المراجعة' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'موافق عليها' },
  refunded: { bg: 'bg-green-100', text: 'text-green-700', label: 'تم استرجاع المبلغ' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'مرفوضة' },
};

export default function ReturnsSection() {
  const [returns, setReturns] = useState<Return[]>([
    {
      id: '1',
      invoiceNumber: 'INV-2024-001',
      customerName: 'أحمد محمد',
      items: 'جهاز كهربائي (مكيف الهواء)',
      reason: 'عطل في الجهاز',
      returnAmount: 3500,
      originalDate: '2024-01-05',
      returnDate: '2024-01-10',
      status: 'refunded',
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    customerName: '',
    items: '',
    reason: '',
    returnAmount: '',
    originalDate: '',
    returnDate: new Date().toISOString().split('T')[0],
  });

  const handleAddReturn = () => {
    if (
      formData.invoiceNumber &&
      formData.customerName &&
      formData.items &&
      formData.returnAmount
    ) {
      const newReturn: Return = {
        id: Date.now().toString(),
        invoiceNumber: formData.invoiceNumber,
        customerName: formData.customerName,
        items: formData.items,
        reason: formData.reason,
        returnAmount: Number(formData.returnAmount),
        originalDate: formData.originalDate,
        returnDate: formData.returnDate,
        status: 'pending',
      };
      setReturns([...returns, newReturn]);
      setFormData({
        invoiceNumber: '',
        customerName: '',
        items: '',
        reason: '',
        returnAmount: '',
        originalDate: '',
        returnDate: new Date().toISOString().split('T')[0],
      });
      setShowForm(false);
    }
  };

  const handleDelete = (id: string) => {
    setReturns(returns.filter((r) => r.id !== id));
  };

  const getStatusColor = (status: Return['status']) => STATUS_COLORS[status];
  const totalReturnAmount = returns.reduce((sum, r) => sum + r.returnAmount, 0);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">إدارة المرتجعات</h1>
          <p className="text-slate-500 mt-1">معالجة فواتير المبيعات المرتجعة والاسترجاعات</p>
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
          مرتجعٌ جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'إجمالي المرتجعات',
            value: returns.length,
            color: '#ef4444',
          },
          {
            label: 'قيد المراجعة',
            value: returns.filter((r) => r.status === 'pending').length,
            color: '#eab308',
          },
          {
            label: 'موافق عليها',
            value: returns.filter((r) => r.status === 'approved').length,
            color: '#3b82f6',
          },
          {
            label: 'إجمالي المبالغ المسترجعة',
            value: `ر.س ${totalReturnAmount.toLocaleString()}`,
            color: '#10b981',
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
          <h2 className="text-lg font-bold text-slate-900 mb-4">تسجيل مرتجعٍ جديد</h2>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="رقم الفاتورة"
              value={formData.invoiceNumber}
              onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="text"
              placeholder="اسم العميل"
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="text"
              placeholder="المنتجات المرتجعة"
              value={formData.items}
              onChange={(e) => setFormData({ ...formData, items: e.target.value })}
              className="col-span-2 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="date"
              placeholder="تاريخ الفاتورة الأصلي"
              value={formData.originalDate}
              onChange={(e) => setFormData({ ...formData, originalDate: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="date"
              placeholder="تاريخ المرتجع"
              value={formData.returnDate}
              onChange={(e) => setFormData({ ...formData, returnDate: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="number"
              placeholder="مبلغ الاسترجاع"
              value={formData.returnAmount}
              onChange={(e) => setFormData({ ...formData, returnAmount: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <textarea
              placeholder="سبب الاسترجاع"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="col-span-2 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right resize-none"
              rows={2}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAddReturn}
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

      {/* Returns Table */}
      <div
        className="rounded-[2.5rem] border overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.4)',
          backdropFilter: 'blur(24px)',
          borderColor: 'rgba(255,255,255,0.6)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr
                style={{
                  background: 'rgba(100,116,139,0.05)',
                  borderBottom: '1px solid rgba(255,255,255,0.6)',
                }}
              >
                <th className="px-6 py-4 font-semibold text-slate-600">رقم الفاتورة</th>
                <th className="px-6 py-4 font-semibold text-slate-600">العميل</th>
                <th className="px-6 py-4 font-semibold text-slate-600">المنتجات</th>
                <th className="px-6 py-4 font-semibold text-slate-600">السبب</th>
                <th className="px-6 py-4 font-semibold text-slate-600">المبلغ</th>
                <th className="px-6 py-4 font-semibold text-slate-600">التاريخ</th>
                <th className="px-6 py-4 font-semibold text-slate-600">الحالة</th>
                <th className="px-6 py-4 font-semibold text-slate-600"></th>
              </tr>
            </thead>
            <tbody>
              {returns.map((ret, idx) => {
                const statusColor = getStatusColor(ret.status);
                return (
                  <tr
                    key={ret.id}
                    style={{
                      borderBottom:
                        idx !== returns.length - 1 ? '1px solid rgba(255,255,255,0.3)' : 'none',
                    }}
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900">{ret.invoiceNumber}</td>
                    <td className="px-6 py-4 text-slate-600">{ret.customerName}</td>
                    <td className="px-6 py-4 text-slate-600">{ret.items}</td>
                    <td className="px-6 py-4 text-slate-600 text-xs">{ret.reason}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      ر.س {ret.returnAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{ret.returnDate}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-lg font-medium text-xs ${statusColor.bg} ${statusColor.text}`}
                      >
                        {statusColor.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDelete(ret.id)}
                        className="p-2 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {returns.length === 0 && !showForm && (
        <div
          className="text-center py-12 rounded-[2.5rem] border"
          style={{
            background: 'rgba(255,255,255,0.3)',
            borderColor: 'rgba(255,255,255,0.5)',
          }}
        >
          <ArrowLeftCircle size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 mb-4">لا توجد مرتجعات حالياً</p>
        </div>
      )}
    </div>
  );
}