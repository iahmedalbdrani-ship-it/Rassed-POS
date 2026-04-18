// src/utils/helpers.ts

export interface Product {  // تأكد من وجود كلمة export هنا
  id: string;
  name: string;
  price: number;
  category: string;
  icon: string;
}

export interface CartItem extends Product {
  qty: number;
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(amount);
};

export const calculateTotals = (cart: CartItem[]) => {
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const subtotal = total / 1.15;
  const tax = total - subtotal;
  return { subtotal, tax, total };
};

export const generateZatcaTLV = (seller: string, vatNo: string, time: string, total: string, vat: string) => {
  const encoder = new TextEncoder();
  const getTLV = (tag: number, value: string) => {
    const valBuf = encoder.encode(value);
    const tagBuf = new Uint8Array([tag]);
    const lenBuf = new Uint8Array([valBuf.length]);
    const combined = new Uint8Array(tagBuf.length + lenBuf.length + valBuf.length);
    combined.set(tagBuf);
    combined.set(lenBuf, tagBuf.length);
    combined.set(valBuf, tagBuf.length + lenBuf.length);
    return combined;
  };
  const tags = [getTLV(1, seller), getTLV(2, vatNo), getTLV(3, time), getTLV(4, total), getTLV(5, vat)];
  const totalLength = tags.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const tagData of tags) { result.set(tagData, offset); offset += tagData.length; }
  return btoa(Array.from(result).map(b => String.fromCharCode(b)).join(''));
};