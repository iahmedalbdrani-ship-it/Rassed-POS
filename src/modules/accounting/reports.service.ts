import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getProfitAndLoss(tenantId: string, startDate: Date, endDate: Date) {
    // 1. جلب كافة الحسابات من نوع إيرادات ومصروفات مع أرصدتها
    const accounts = await this.prisma.account.findMany({
      where: { tenantId },
      include: {
        journalLines: {
          where: {
            entry: {
              date: { gte: startDate, lte: endDate }
            }
          }
        }
      }
    });

    // 2. معالجة البيانات لحساب صافي كل حساب
    const reportData = accounts.map(acc => {
      const totalDebit = acc.journalLines.reduce((sum, line) => sum + Number(line.debit), 0);
      const totalCredit = acc.journalLines.reduce((sum, line) => sum + Number(line.credit), 0);
      
      // في المحاسبة: الإيرادات تزيد بالدائن، المصروفات تزيد بالمدين
      const balance = acc.type === 'REVENUE' ? (totalCredit - totalDebit) : (totalDebit - totalCredit);
      
      return { name: acc.name, type: acc.type, balance };
    });

    const totalRevenue = reportData.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0);
    const totalExpense = reportData.filter(a => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0);

    return {
      details: reportData,
      summary: {
        totalRevenue,
        totalExpense,
        netProfit: totalRevenue - totalExpense
      }
    };
  }
}