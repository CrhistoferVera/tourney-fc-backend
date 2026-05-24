import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { MatchEntity } from './entities/match.entity';
import { UpdateMatchDto } from './dto/update-match.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MatchControlDto } from './dto/match-control.dto';
import { MatchEventDto } from './dto/match-event.dto';

@ApiTags('Matches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Ver detalle de un partido',
    description: 'Retorna datos completos de un partido (HU-24)',
  })
  @ApiParam({ name: 'id', description: 'UUID del partido' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del partido',
    type: MatchEntity,
  })
  @ApiResponse({ status: 404, description: 'Partido no encontrado' })
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar partido',
    description:
      'Edita fecha o cancha — CAPITAN/ORGANIZADOR/STAFF si está PENDIENTE. Solo ORGANIZADOR/STAFF pueden cambiar estado (HU-24)',
  })
  @ApiParam({ name: 'id', description: 'UUID del partido' })
  @ApiResponse({
    status: 200,
    description: 'Partido actualizado',
    type: MatchEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Fecha fuera de rango o cancha inválida',
  })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateMatchDto,
  ) {
    return this.matchesService.update(id, req.user.id, dto);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirmar partido' })
  confirmOne(@Param('id') id: string, @Request() req: any) {
    return this.matchesService.confirm(id, req.user.id);
  }

  @Post('tournament/:torneoId/confirm-all')
  @ApiOperation({
    summary: 'Confirmar todos los partidos y poner torneo EN_CURSO',
  })
  confirmAll(@Param('torneoId') torneoId: string, @Request() req: any) {
    return this.matchesService.confirmAll(torneoId, req.user.id);
  }

  @Patch(':id/control')
  @ApiOperation({ summary: 'Controlar cronómetro y fase del partido en vivo' })
  controlLiveMatch(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: MatchControlDto,
  ) {
    return this.matchesService.controlLiveMatch(id, req.user.id, dto);
  }

  @Post(':id/events')
  @ApiOperation({ summary: 'Registrar un evento en el partido (Goles, Faltas, Tarjetas, etc)' })
  addEvent(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: MatchEventDto,
  ) {
    return this.matchesService.addEvent(id, req.user.id, dto);
  }

  @Delete(':id/events/:eventId')
  @ApiOperation({ summary: 'Eliminar un evento del partido' })
  deleteEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    return this.matchesService.deleteEvent(id, eventId, req.user.id);
  }
}

