import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { FixturesService } from './fixtures.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FixturePartidoEntity } from './entities/fixture.entity';

@ApiTags('Fixtures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fixtures')
export class FixturesController {
  constructor(private readonly fixturesService: FixturesService) {}

  @Post('tournament/:torneoId/generate')
  @ApiOperation({ summary: 'Generar fixture', description: 'Genera el fixture del torneo según su formato — solo ORGANIZADOR o STAFF (HU-15)' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiResponse({ status: 201, description: 'Fixture generado', type: [FixturePartidoEntity] })
  @ApiResponse({ status: 400, description: 'Menos de 2 equipos inscritos' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  generate(@Param('torneoId') torneoId: string, @Request() req: any) {
    return this.fixturesService.generate(torneoId, req.user.id);
  }

  @Get('tournament/:torneoId')
  @ApiOperation({ summary: 'Ver fixture del torneo', description: 'Retorna todos los partidos agrupados por ronda (HU-23)' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Fixture del torneo' })
  findAll(@Param('torneoId') torneoId: string) {
    return this.fixturesService.findAll(torneoId);
  }

  @Get('tournament/:torneoId/equipo/:equipoId')
  @ApiOperation({ summary: 'Ver fixture de un equipo', description: 'Retorna los partidos de un equipo específico (HU-19)' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiParam({ name: 'equipoId', description: 'UUID del equipo' })
  @ApiResponse({ status: 200, description: 'Partidos del equipo' })
  findByEquipo(@Param('torneoId') torneoId: string, @Param('equipoId') equipoId: string) {
    return this.fixturesService.findByEquipo(torneoId, equipoId);
  }
}