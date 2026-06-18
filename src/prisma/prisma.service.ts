import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// WHY a service: NestJS owns one shared instance (singleton) and injects it
// everywhere. Lifecycle hooks connect on boot and disconnect on shutdown so we
// don't leak DB connections. This is the "data layer" every other module uses.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
