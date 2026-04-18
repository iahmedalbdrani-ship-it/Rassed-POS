export interface Product {
  id: string;        // يجب أن يطابق اسم العمود في Supabase
  name: string;      // يجب أن يطابق name
  price: number;     // يجب أن يطابق price
  vat_rate: number;  // يجب أن يطابق vat_rate
  barcode: string;   // يجب أن يطابق barcode
  stock: number;     // يجب أن يطابق stock
}