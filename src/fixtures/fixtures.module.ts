import { Module } from '@nestjs/common';
import { FixturesService } from './fixtures.service';
import { FixturesController } from './fixtures.controller';
import { PrismaModule } from '../prisma/prisma.module';
//preuba autodeploy
@Module({
  imports: [PrismaModule],
  controllers: [FixturesController],
  providers: [FixturesService],
  exports: [FixturesService],
})
export class FixturesModule {}
