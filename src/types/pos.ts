// ============================================================
// Raseed POS - TypeScript Types
// ============================================================

export interface Product {
  id: string;
  name: string;
  nameAr: string;
  nameEn: string;
  price: number;
  category: ProductCategory;
  image?: string;
  icon?: string;
  sku: string;
  stock: number;
  unit: string;
}

export type ProductCategory = 
  | 'rice'
  | 'drinks'
  | 'dairy'
  | 'cleaning'
  | 'snacks'
  | 'frozen'
  | 'bakery'
  | 'oils'
  | 'spices'
  | 'canned';

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

export interface CartTotals {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
}

export interface PaymentMethod {
  id: PaymentType;
  name: string;
  nameAr: string;
  icon: string;
  color: string;
}

export type PaymentType = 'cash' | 'mada' | 'visa' | 'mastercard' | 'apple_pay';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: Date;
  items: CartItem[];
  totals: CartTotals;
  paymentMethod: PaymentType;
  cashier: string;
  customer?: {
    name: string;
    phone?: string;
  };
  notes?: string;
}

export interface StoreSettings {
  name: string;
  nameEn: string;
  address: string;
  phone: string;
  email?: string;
  vatNumber: string;
  crNumber: string;
  taxRate: number;
  currency: string;
  currencySymbol: string;
  logo?: string;
  receiptFooter?: string;
}

export interface ZATCAQRData {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: number;
  taxAmount: number;
}

export interface CategoryFilter {
  id: ProductCategory | 'all';
  name: string;
  icon: string;
  color: string;
}
