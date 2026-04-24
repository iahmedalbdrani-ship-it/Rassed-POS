// ============================================================
// رصيد — Customer Types
// org_id مُلزَم في كل عملية قراءة/كتابة
// ============================================================

export interface Customer {
  id:         string;
  org_id:     string;        // عزل المؤسسة — لا يُقبل فارغاً
  name:       string;
  phone:      string | null;
  email:      string | null;
  address:    string | null;
  vat_number: string | null;
  cr_number:  string | null;
  notes:      string | null;
  is_active:  boolean;
  created_at: string;
  updated_at: string;
}

/** للإدراج — id, created_at, updated_at يُولَّدان من قاعدة البيانات */
export type CustomerInsert = Omit<Customer, 'id' | 'created_at' | 'updated_at'>;

/** للتحديث — id و org_id غير قابلَين للتغيير */
export type CustomerUpdate = Partial<Omit<Customer, 'id' | 'org_id' | 'created_at'>>;

/** نتيجة قائمة مختصرة (للقوائم المنسدلة) */
export interface CustomerOption {
  id:   string;
  name: string;
  phone: string | null;
  vat_number: string | null;
}
