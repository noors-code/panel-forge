import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global = register once, available to every module without re-importing.
// Good for cross-cutting infra (db, redis). Don't overuse it for feature code.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
