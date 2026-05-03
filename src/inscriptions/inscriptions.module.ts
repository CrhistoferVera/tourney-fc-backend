import { Module } from '@nestjs/common';
import { InscriptionsService } from './inscriptions.service';
import { InscriptionsController } from './inscriptions.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InscriptionsController],
  providers: [InscriptionsService],
  exports: [InscriptionsService],
})
export class InscriptionsModule {}