import { Module } from '@nestjs/common';
import { WebtoonController } from './webtoon.controller';
import { WebtoonService } from './webtoon.service';

@Module({
  controllers: [WebtoonController],
  providers: [WebtoonService],
})
export class WebtoonModule {}
