import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// The Controller's job: handle HTTP, delegate real work to services (injected
// here via the constructor — that's DI). It returns plain objects; Nest
// serializes them to JSON.
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    // Cheapest possible round-trip to prove each dependency is reachable.
    const db = await this.prisma
      .$queryRaw`SELECT 1`.then(() => 'up')
      .catch(() => 'down');
    const cache = await this.redis
      .ping()
      .then(() => 'up')
      .catch(() => 'down');

    return { status: 'ok', db, cache };
  }
}
