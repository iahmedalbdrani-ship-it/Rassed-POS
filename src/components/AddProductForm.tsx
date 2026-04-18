// استيراد الدوال التي تولدت تلقائياً
import { createProduct } from '../dataconnect-generated'; 
import { useDataConnectMutation } from '@firebase/dataconnect-react';

export default function AddProductButton() {
  // استخدام الـ Mutation التي صممناها في queries.gql
  const { execute: saveProduct } = useDataConnectMutation(createProduct);

  const handleAddProduct = async () => {
    try {
      await saveProduct({
        itemName: "منتج تجريبي زجاجي",
        sku: "RS-9900",
        costPrice: 50.0,
        salePrice: 75.0,
        currentStock: 10,
        vatRate: 0.15,
        description: "أول منتج يتم إضافته عبر نظام رصيد المطور"
      });
      alert("تم الحفظ في السحاب بنجاح!");
    } catch (error) {
      console.error("خطأ في الحفظ:", error);
    }
  };

  return (
    <button 
      onClick={handleAddProduct}
      className="bg-white/20 backdrop-blur-md border border-white/40 p-4 rounded-3xl font-black hover:bg-white/40 transition-all"
    >
      تثبيت المنتج في النظام
    </button>
  );
}