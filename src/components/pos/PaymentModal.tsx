// ============================================================
// Raseed POS - Payment Modal Component
// ============================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Banknote, CreditCard, Smartphone, Check, ArrowRight } from 'lucide-react';
import type { CartTotals, PaymentType } from '../../types/pos';
import { PAYMENT_METHODS } from '../../data/products';
import { fmt } from '../../constants/theme';

interface PaymentModalProps {
  isOpen: boolean;
  totals: CartTotals;
  onClose: () => void;
  onConfirm: (method: PaymentType) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  totals,
  onClose,
  onConfirm,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMethod(null);
      setIsProcessing(false);
      setIsComplete(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!selectedMethod) return;
    
    setIsProcessing(true);
    
    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    setIsProcessing(false);
    setIsComplete(true);
    
    // Wait for success animation then call onConfirm
    setTimeout(() => {
      onConfirm(selectedMethod);
    }, 1000);
  };

  const getPaymentIcon = (method: PaymentType) => {
    switch (method) {
      case 'cash':
        return <Banknote className="w-8 h-8" />;
      case 'mada':
      case 'visa':
      case 'mastercard':
        return <CreditCard className="w-8 h-8" />;
      default:
        return <Smartphone className="w-8 h-8" />;
    }
  };

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
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="bg-white/90 backdrop-blur-3xl rounded-[3rem] w-full max-w-lg border border-white/60 shadow-2xl pointer-events-auto overflow-hidden">
              
              {/* Header */}
              <div className="p-8 pb-6 border-b border-slate-100 relative">
                <button
                  onClick={onClose}
                  className="absolute left-6 top-6 p-3 hover:bg-slate-100 rounded-2xl transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
                
                <div className="text-center">
                  <h2 className="text-2xl font-black text-slate-800 mb-2">طريقة الدفع</h2>
                  <p className="text-slate-500">اختر طريقة الدفع المناسبة</p>
                </div>
              </div>

              {/* Content */}
              <div className="p-8 space-y-6">
                {/* Total Display */}
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-6 text-white text-center">
                  <p className="text-sm opacity-80 mb-1">المبلغ الإجمالي</p>
                  <motion.p
                    key={totals.total}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="text-4xl font-black"
                  >
                    {fmt.format(totals.total)}
                  </motion.p>
                </div>

                {/* Payment Methods */}
                <div className="space-y-3">
                  {PAYMENT_METHODS.map((method) => (
                    <motion.button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`
                        w-full flex items-center justify-between p-5 rounded-3xl font-bold
                        transition-all duration-300 border-2
                        ${
                          selectedMethod === method.id
                            ? `${method.color} text-white border-transparent shadow-xl`
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-white'
                        }
                      `}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-center gap-4">
                        {getPaymentIcon(method.id)}
                        <span className="text-lg">{method.nameAr}</span>
                      </div>
                      {selectedMethod === method.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"
                        >
                          <Check className="w-5 h-5" />
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* Confirm Button */}
                <motion.button
                  onClick={handleConfirm}
                  disabled={!selectedMethod || isProcessing || isComplete}
                  className={`
                    w-full py-5 rounded-[1.8rem] font-black text-lg shadow-xl
                    transition-all duration-300 flex items-center justify-center gap-3
                    ${
                      !selectedMethod || isProcessing
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : isComplete
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-2xl hover:shadow-orange-300/50'
                    }
                  `}
                  whileHover={selectedMethod && !isProcessing ? { scale: 1.02 } : {}}
                  whileTap={selectedMethod && !isProcessing ? { scale: 0.98 } : {}}
                >
                  {isProcessing ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full"
                      />
                      <span>جاري المعالجة...</span>
                    </>
                  ) : isComplete ? (
                    <>
                      <Check className="w-6 h-6" />
                      <span>تمت العملية!</span>
                    </>
                  ) : (
                    <>
                      <span>تأكيد الدفع</span>
                      <ArrowRight className="w-6 h-6" />
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
