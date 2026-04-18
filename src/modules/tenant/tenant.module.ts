import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { AccountingModule } from '../accounting/accounting.module'; // 👈 استيراد الوحدة

@Module({
  imports: [AccountingModule], // 👈 إضافة وحدة المحاسبة هنا
  providers: [TenantService],
})
export class TenantModule {}