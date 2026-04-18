import { Module } from '@nestjs/common';
import { CoaGeneratorService } from './coa-generator.service';

@Module({
  providers: [CoaGeneratorService],
  exports: [CoaGeneratorService], // 👈 مهم جداً لكي تراه وحدة الـ Tenant
})
export class AccountingModule {}