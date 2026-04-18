import { Injectable } from '@nestjs/common';
import { CoaGeneratorService } from '../accounting/coa-generator.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantService {
  // حقن مولد الحسابات داخل خدمة الشركات
  constructor(
    private prisma: PrismaService,
    private coaGenerator: CoaGeneratorService 
  ) {}

  async createTenant(data: any) {
    return this.prisma.$transaction(async (tx) => {
      // 1. إنشاء الشركة
      const tenant = await tx.tenant.create({ data });

      // 2. استدعاء المولد باستخدام المعرف الجديد
      await this.coaGenerator.seedDefaultAccounts(tenant.id);

      return tenant;
    });
  }
}