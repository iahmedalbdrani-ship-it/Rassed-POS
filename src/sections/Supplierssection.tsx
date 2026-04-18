import { useState } from 'react';
import { Plus, Edit2, Trash2, Phone, Building2 } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export default function SuppliersSection() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([
    {
      id: '1',
      name: 'شركة الخليج للتوزيع',
      taxId: '3100xxx-xxx',
      phone: '+966501234567',
      email: 'info@khaleej.com',
      address: 'جدة، الحمراء',
      createdAt: '2024-01-15',
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    taxId: '',
    phone: '',
    email: '',
    address: '',
  });

  const handleAddSupplier = () => {
    if (formData.name && formData.taxId && formData.phone) {
      const newSupplier: Supplier = {
        id: Date.now().toString(),
        ...formData,
        createdAt: new Date().toLocaleDateString('ar-SA'),
      };
      setSuppliers([...suppliers, newSupplier]);
      setFormData({ name: '', taxId: '', phone: '', email: '', address: '' });
      setShowForm(false);
    }
  };

  const handleDelete = (id: string) => {
    setSuppliers(suppliers.filter((s) => s.id !== id));
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">إدارة الموردين</h1>
          <p className="text-slate-500 mt-1">إدارة بيانات الموردين والعلاقات التجارية</p>
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
          موردٍ جديد
        </button>
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
          <h2 className="text-lg font-bold text-slate-900 mb-4">إضافة موردٍ جديد</h2>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="اسم المورد"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="text"
              placeholder="الرقم الضريبي"
              value={formData.taxId}
              onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="tel"
              placeholder="رقم الجوال"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="email"
              placeholder="البريد الإلكتروني"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
            <input
              type="text"
              placeholder="العنوان"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="col-span-2 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAddSupplier}
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

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {suppliers.map((supplier) => (
          <div
            key={supplier.id}
            className="p-5 rounded-[2.5rem] border"
            style={{
              background: 'rgba(255,255,255,0.4)',
              backdropFilter: 'blur(24px)',
              borderColor: 'rgba(255,255,255,0.6)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{
                    background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                  }}
                >
                  {supplier.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{supplier.name}</h3>
                  <p className="text-xs text-slate-500">{supplier.taxId}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                  <Edit2 size={16} className="text-slate-500" />
                </button>
                <button
                  onClick={() => handleDelete(supplier.id)}
                  className="p-2 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Phone size={14} className="text-amber-600" />
                <span className="text-right flex-1">{supplier.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 size={14} className="text-amber-600" />
                <span className="text-right flex-1">{supplier.address || 'لم يتم تحديده'}</span>
              </div>
              <p className="text-xs text-slate-400 mt-3 text-right">
                أضيف في {supplier.createdAt}
              </p>
            </div>
          </div>
        ))}
      </div>

      {suppliers.length === 0 && !showForm && (
        <div
          className="text-center py-12 rounded-[2.5rem] border"
          style={{
            background: 'rgba(255,255,255,0.3)',
            borderColor: 'rgba(255,255,255,0.5)',
          }}
        >
          <p className="text-slate-500 mb-4">لا توجد موردين حالياً</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-slate-700 border border-slate-300 hover:bg-slate-100 transition-colors"
          >
            <Plus size={16} />
            أضف أول موردٍ
          </button>
        </div>
      )}
    </div>
  );
}