import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from './roles.decorator'; // دالة مخصصة بسيطة

@Controller('reports')
export class ReportsController {
  
  @Get('profit-loss')
  @Roles('ADMIN', 'ACCOUNTANT') // 👈 الكاشير (CASHIER) لن يستطيع الدخول هنا
  async getPLReport() {
    // منطق جلب التقرير...
  }

  @Get('pos-summary')
  @Roles('ADMIN', 'ACCOUNTANT', 'CASHIER') // الكل مسموح له هنا
  async getPosSummary() {
     // منطق ملخص المبيعات...
  }
}