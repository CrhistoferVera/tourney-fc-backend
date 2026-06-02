import { Module, forwardRef } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [PrismaModule, ConfigModule, CloudinaryModule, forwardRef(() => MatchesModule)],
  controllers: [TournamentsController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
