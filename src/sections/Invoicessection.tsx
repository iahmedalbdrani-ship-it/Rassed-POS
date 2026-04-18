import { useState } from 'react';
import { Plus, FileText, Eye, Download, QrCode, Calendar, DollarSign } from 'lucide-react';

interface Invoice {
  id: string;
  number: string;
  customerName: string;
  total: number;
  tax: number;
  date: string;
  items: number;
  status: 'paid' | 'pending' | 'overdue';
}

const STATUS_COLORS = {
  paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'مدفوعة' },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'قيد الانتظار' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'متأخرة' },
};

export default function InvoicesSection() {
  const [invoices, setInvoices] = useState<Invoice[]>([
    {
      id: '1',
      number: 'INV-2024-001',
      customerName: 'محمد عبد الرحمن',
      total: 2500,
      tax: 375,
      date: '2024-01-20',
      items: 5,
      status: 'paid',
    },
    {
      id: '2',
      number: 'INV-2024-002',
      customerName: 'فاطمة سالم',
      total: 1800,
      tax: 270,
      date: '2024-01-21',
      items: 3,
      status: 'pending',
    },
    {
      id: '3',
      number: 'INV-2024-003',
      customerName: 'علي محمود',
      total: 3200,
      tax: 480,
      date: '2024-01-19',
      items: 8,
      status: 'paid',
    },
  ]);

  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const getStatusColor = (status: Invoice['status']) => STATUS_COLORS[status];
  const totalRevenue = invoices.reduce((sum, i) => sum + i.total, 0);
  const paidInvoices = invoices.filter((i) => i.status === 'paid').length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">الفواتير</h1>
          <p className="text-slate-500 mt-1">عرض وإدارة جميع الفواتير الصادرة</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-black transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            boxShadow: '0 4px 15px rgba(245,158,11,0.3)',
          }}
        >
          <Plus size={18} />
          فاتورةٌ جديدة
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'إجمالي الفواتير',
            value: invoices.length,
            color: '#f59e0b',
          },
          {
            label: 'الفواتير المدفوعة',
            value: paidInvoices,
            color: '#10b981',
          },
          {
            label: 'الفواتير المعلقة',
            value: invoices.filter((i) => i.status === 'pending').length,
            color: '#eab308',
          },
          {
            label: 'إجمالي الإيراد',
            value: `ر.س ${totalRevenue.toLocaleString()}`,
            color: '#6366f1',
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

      {/* Invoices Table */}
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
                <th className="px-6 py-4 font-semibold text-slate-600">البنود</th>
                <th className="px-6 py-4 font-semibold text-slate-600">الضريبة</th>
                <th className="px-6 py-4 font-semibold text-slate-600">الإجمالي</th>
                <th className="px-6 py-4 font-semibold text-slate-600">التاريخ</th>
                <th className="px-6 py-4 font-semibold text-slate-600">الحالة</th>
                <th className="px-6 py-4 font-semibold text-slate-600">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice, idx) => {
                const statusColor = getStatusColor(invoice.status);
                return (
                  <tr
                    key={invoice.id}
                    style={{
                      borderBottom:
                        idx !== invoices.length - 1
                          ? '1px solid rgba(255,255,255,0.3)'
                          : 'none',
                    }}
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {invoice.number}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{invoice.customerName}</td>
                    <td className="px-6 py-4 text-slate-600 text-center">
                      <span
                        className="px-2 py-1 rounded-lg text-xs font-medium"
                        style={{
                          background: 'rgba(99,102,241,0.1)',
                          color: '#6366f1',
                        }}
                      >
                        {invoice.items}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">ر.س {invoice.tax.toLocaleString()}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      ر.س {invoice.total.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{invoice.date}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-lg font-medium text-xs ${statusColor.bg} ${statusColor.text}`}
                      >
                        {statusColor.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowPreview(invoice.id);
                          }}
                          title="معاينة الباركود"
                          className="p-2 rounded-lg hover:bg-blue-100 transition-colors group relative"
                        >
                          <QrCode size={14} className="text-blue-600" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap mb-1">
                            معاينة
                          </span>
                        </button>
                        <button
                          title="تحميل"
                          className="p-2 rounded-lg hover:bg-green-100 transition-colors group relative"
                        >
                          <Download size={14} className="text-green-600" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap mb-1">
                            تحميل
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Code Preview Modal */}
      {showPreview && selectedInvoice && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowPreview(null)}
            style={{ backdropFilter: 'blur(8px)' }}
          />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 p-8 rounded-[2.5rem] border"
            style={{
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(24px)',
              borderColor: 'rgba(255,255,255,0.8)',
              maxWidth: '500px',
              width: '90%',
            }}
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                الفاتورة {selectedInvoice.number}
              </h2>
              <p className="text-slate-500 mb-6">باركود الفاتورة</p>

              {/* QR Code placeholder */}
              <div
                className="w-64 h-64 mx-auto rounded-[1.5rem] border-2 border-dashed border-slate-300 flex items-center justify-center mb-6 bg-slate-50"
              >
                <div className="text-center">
                  <QrCode size={48} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-sm text-slate-500">
                    {selectedInvoice.number}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    ر.س {selectedInvoice.total.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Invoice details */}
              <div className="bg-slate-50 rounded-xl p-4 mb-6 text-right">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">العميل</p>
                    <p className="font-semibold text-slate-900">{selectedInvoice.customerName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">التاريخ</p>
                    <p className="font-semibold text-slate-900">{selectedInvoice.date}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">الضريبة</p>
                    <p className="font-semibold text-slate-900">
                      ر.س {selectedInvoice.tax.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">الإجمالي</p>
                    <p className="font-bold text-amber-600 text-lg">
                      ر.س {selectedInvoice.total.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPreview(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-black transition-all"
                  style={{
                    background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                  }}
                >
                  تحميل
                </button>
                <button
                  onClick={() => setShowPreview(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-700 border border-slate-300 transition-all"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {invoices.length === 0 && (
        <div
          className="text-center py-12 rounded-[2.5rem] border"
          style={{
            background: 'rgba(255,255,255,0.3)',
            borderColor: 'rgba(255,255,255,0.5)',
          }}
        >
          <FileText size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 mb-4">لم تقم بإصدار أي فواتير حتى الآن</p>
        </div>
      )}
    </div>
  );
}