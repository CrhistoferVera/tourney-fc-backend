import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TournamentEntity } from './entities/tournament.entity';

@ApiTags('Tournaments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear torneo', description: 'Crea un torneo y asigna al usuario como ORGANIZADOR (HU-6, HU-7, HU-8)' })
  @ApiResponse({ status: 201, description: 'Torneo creado en estado BORRADOR', type: TournamentEntity })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  create(@Request() req: any, @Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Buscar torneos disponibles', description: 'Lista torneos públicos en estado EN_INSCRIPCION o EN_CURSO (HU-12)' })
  @ApiQuery({ name: 'nombre', required: false, description: 'Filtrar por nombre' })
  @ApiQuery({ name: 'zona', required: false, description: 'Filtrar por zona' })
  @ApiResponse({ status: 200, description: 'Lista de torneos disponibles', type: [TournamentEntity] })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  findAll(@Query() query: QueryTournamentDto) {
    return this.tournamentsService.findAll(query);
  }

  @Get('my')
  @ApiOperation({ summary: 'Mis torneos', description: 'Lista los torneos donde participa el usuario autenticado con su rol (HU-5)' })
  @ApiResponse({ status: 200, description: 'Lista de torneos del usuario ordenados por estado' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  findMy(@Request() req: any) {
    return this.tournamentsService.findMy(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un torneo', description: 'Retorna datos completos del torneo incluyendo rol del usuario' })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Detalle del torneo', type: TournamentEntity })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar torneo', description: 'Actualiza datos del torneo — solo el ORGANIZADOR puede hacerlo (HU-10)' })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Torneo actualizado', type: TournamentEntity })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 403, description: 'Solo el organizador puede editar el torneo' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateTournamentDto) {
    return this.tournamentsService.update(id, req.user.id, dto);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publicar torneo', description: 'Cambia el estado de BORRADOR a EN_INSCRIPCION (HU-11)' })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Torneo publicado en estado EN_INSCRIPCION' })
  @ApiResponse({ status: 400, description: 'El torneo no está en estado BORRADOR' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 403, description: 'Solo el organizador puede publicar el torneo' })
  publish(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.publish(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar torneo', description: 'Elimina el torneo — solo el ORGANIZADOR puede hacerlo' })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Torneo eliminado exitosamente' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 403, description: 'Solo el organizador puede eliminar el torneo' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.remove(id, req.user.id);
  }
}