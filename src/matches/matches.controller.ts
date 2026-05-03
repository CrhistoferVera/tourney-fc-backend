import { Controller, Get, Patch, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { UpdateMatchDto } from './dto/update-match.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MatchEntity } from './entities/match.entity';

@ApiTags('Matches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Ver detalle de un partido', description: 'Retorna datos completos de un partido (HU-24)' })
  @ApiParam({ name: 'id', description: 'UUID del partido' })
  @ApiResponse({ status: 200, description: 'Detalle del partido', type: MatchEntity })
  @ApiResponse({ status: 404, description: 'Partido no encontrado' })
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar partido', description: 'Edita fecha o cancha — CAPITAN/ORGANIZADOR/STAFF si está PENDIENTE. Solo ORGANIZADOR/STAFF pueden cambiar estado (HU-24)' })
  @ApiParam({ name: 'id', description: 'UUID del partido' })
  @ApiResponse({ status: 200, description: 'Partido actualizado', type: MatchEntity })
  @ApiResponse({ status: 400, description: 'Fecha fuera de rango o cancha inválida' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, req.user.id, dto);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirmar partido', description: 'Cambia estado a CONFIRMADO — solo ORGANIZADOR o STAFF' })
  @ApiParam({ name: 'id', description: 'UUID del partido' })
  @ApiResponse({ status: 201, description: 'Partido confirmado' })
  @ApiResponse({ status: 400, description: 'Ya estaba confirmado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.matchesService.confirm(id, req.user.id);
  }
}