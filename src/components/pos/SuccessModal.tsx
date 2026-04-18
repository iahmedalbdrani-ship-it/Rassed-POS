// ============================================================
// Raseed POS - Success Modal Component
// ============================================================

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Receipt, Sparkles } from 'lucide-react';
import type { CartTotals, PaymentType } from '../../types/pos';
import { fmt } from '../../constants/theme';

interface SuccessModalProps {
  isOpen: boolean;
  totals: CartTotals;
  invoiceNumber: string;
  paymentMethod: PaymentType;
  onPrintReceipt: () => void;
  onNewSale: () => void;
  onClose: () => void;
}

const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: 'نقدي',
  mada: 'بطاقة مدى',
  visa: 'فيزا',
  mastercard: 'ماستركارد',
  apple_pay: 'آبل باي',
};

export const SuccessModal: React.FC<SuccessModalProps> = ({
  isOpen,
  totals,
  invoiceNumber,
  paymentMethod,
  onPrintReceipt,
  onNewSale,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="bg-white/90 backdrop-blur-3xl rounded-[3rem] w-full max-w-md border border-white/60 shadow-2xl pointer-events-auto overflow-hidden">
              
              {/* Success Header */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-center relative overflow-hidden">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                  className="w-24 h-24 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.4, stiffness: 200 }}
                  >
                    <CheckCircle2 className="w-14 h-14 text-white" />
                  </motion.div>
                </motion.div>
                
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-black text-white mb-2"
                >
                  تمت العملية بنجاح!
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-emerald-100"
                >
                  تم تسجيل البيع في النظام
                </motion.p>

                {/* Floating decorations */}
                <motion.div
                  animate={{ y: [-5, 5, -5], rotate: [0, 10, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute top-4 right-8 text-3xl opacity-30"
                >
                  ✨
                </motion.div>
                <motion.div
                  animate={{ y: [5, -5, 5], rotate: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute bottom-4 left-8 text-2xl opacity-30"
                >
                  💰
                </motion.div>
              </div>

              {/* Content */}
              <div className="p-8 space-y-6">
                {/* Invoice Info */}
                <div className="bg-slate-50 rounded-3xl p-5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">رقم الفاتورة</span>
                    <span className="font-black text-slate-800">{invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">طريقة الدفع</span>
                    <span className="font-bold text-slate-700">{PAYMENT_LABELS[paymentMethod]}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                    <span className="font-bold text-slate-800">المبلغ المدفوع</span>
                    <span className="text-2xl font-black text-emerald-600">{fmt.format(totals.total)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  <motion.button
                    onClick={onPrintReceipt}
                    className="w-full py-4 rounded-[1.5rem] font-bold text-lg
                      bg-gradient-to-r from-orange-500 to-amber-500 text-white
                      shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Receipt className="w-6 h-6" />
                    <span>طباعة الفاتورة</span>
                  </motion.button>

                  <motion.button
                    onClick={onNewSale}
                    className="w-full py-4 rounded-[1.5rem] font-bold text-lg
                      bg-slate-100 text-slate-700 hover:bg-slate-200
                      transition-all flex items-center justify-center gap-3"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Sparkles className="w-6 h-6" />
                    <span>بيع جديد</span>
                  </motion.button>

                  <motion.button
                    onClick={onClose}
                    className="w-full py-3 text-slate-400 hover:text-slate-600 transition-colors"
                    whileTap={{ scale: 0.95 }}
                  >
                    إغلاق
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
