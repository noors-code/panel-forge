import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { WebtoonModule } from './webtoon/webtoon.module';

// The root module wires everything together. `imports` pulls in other modules'
// exported providers. This is the dependency graph an interviewer asks you to
// "walk through" — each feature gets its own module as we go.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // loads .env, available everywhere
    PrismaModule,
    RedisModule,
    HealthModule,
    WebtoonModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
