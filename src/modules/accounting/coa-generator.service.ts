import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoaGeneratorService {
  constructor(private prisma: PrismaService) {}

  async seedDefaultAccounts(tenantId: string) {
    const defaultAccounts = [
      { name: 'الصندوق', code: '1101', type: 'ASSET' },
      { name: 'البنك', code: '1102', type: 'ASSET' },
      // ... باقي الحسابات
    ];

    return await this.prisma.account.createMany({
      data: defaultAccounts.map(acc => ({ ...acc, tenantId })),
    });
  }
}