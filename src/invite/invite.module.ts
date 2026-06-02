import { Module } from '@nestjs/common';
import { InviteController } from './invite.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InviteController],
})
export class InviteModule {}
