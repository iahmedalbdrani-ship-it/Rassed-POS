import { useState } from 'react';
import { Plus, Package, Calendar } from 'lucide-react';

interface Purchase {
  id: string;
  supplierName: string;
  items: string;
  quantity: number;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled';
  orderDate: string;
  expectedDate: string;
}

const STATUS_COLORS = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'قيد الانتظار' },
  confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'مؤكد' },
  delivered: { bg: 'bg-green-100', text: 'text-green-700', label: 'تم التسليم' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'ملغاة' },
};

export default function PurchasesSection() {
  const [purchases] = useState<Purchase[]>([
    {
      id: '1',
      supplierName: 'شركة الخليج للتوزيع',
      items: 'منتجات إلكترونية',
      quantity: 50,
      totalAmount: 15000,
      status: 'delivered',
      orderDate: '2024-01-10',
      expectedDate: '2024-01-15',
    },
    {
      id: '2',
      supplierName: 'المصنع الحديث',
      items: 'مواد أولية',
      quantity: 100,
      totalAmount: 25000,
      status: 'confirmed',
      orderDate: '2024-01-15',
      expectedDate: '2024-01-20',
    },
  ]);

  const getStatusColor = (status: Purchase['status']) => STATUS_COLORS[status];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">سجل المشتريات</h1>
          <p className="text-slate-500 mt-1">تتبع جميع طلبات المشتريات وحالاتها</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-black transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            boxShadow: '0 4px 15px rgba(245,158,11,0.3)',
          }}
        >
          <Plus size={18} />
          طلب جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'إجمالي الطلبات', value: purchases.length, color: '#f59e0b' },
          { label: 'قيد الانتظار', value: purchases.filter((p) => p.status === 'pending').length, color: '#eab308' },
          { label: 'تم التسليم', value: purchases.filter((p) => p.status === 'delivered').length, color: '#10b981' },
          { label: 'إجمالي المشتريات', value: `ر.س ${purchases.reduce((sum, p) => sum + p.totalAmount, 0).toLocaleString()}`, color: '#6366f1' },
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
            <p
              className="text-2xl font-bold"
              style={{ color: typeof stat.value === 'number' && stat.value < 100 ? stat.color : '#1e293b' }}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Purchases Table */}
      <div
        className="rounded-[2.5rem] border overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.4)',
          backdropFilter: 'blur(24px)',
          borderColor: 'rgba(255,255,255,0.6)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr
                style={{
                  background: 'rgba(100,116,139,0.05)',
                  borderBottom: '1px solid rgba(255,255,255,0.6)',
                }}
              >
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">المورد</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">الصنف</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">الكمية</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">المبلغ الكلي</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">تاريخ الطلب</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">التاريخ المتوقع</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase, idx) => {
                const statusColor = getStatusColor(purchase.status);
                return (
                  <tr
                    key={purchase.id}
                    style={{
                      borderBottom:
                        idx !== purchases.length - 1 ? '1px solid rgba(255,255,255,0.3)' : 'none',
                    }}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{purchase.supplierName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{purchase.items}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{purchase.quantity}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                      ر.س {purchase.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2 justify-end">
                        <Calendar size={14} />
                        {purchase.orderDate}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{purchase.expectedDate}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-lg font-medium text-xs ${statusColor.bg} ${statusColor.text}`}
                      >
                        {statusColor.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {purchases.length === 0 && (
        <div
          className="text-center py-12 rounded-[2.5rem] border"
          style={{
            background: 'rgba(255,255,255,0.3)',
            borderColor: 'rgba(255,255,255,0.5)',
          }}
        >
          <Package size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 mb-4">لم تقم بأي عملية شراء حتى الآن</p>
        </div>
      )}
    </div>
  );
}