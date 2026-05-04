import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeamEntity } from './entities/team.entity';

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post('tournament/:torneoId')
  @ApiOperation({ summary: 'Crear equipo en un torneo', description: 'Crea un equipo y asigna al usuario como CAPITAN del torneo (HU-13)' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiResponse({ status: 201, description: 'Equipo creado', type: TeamEntity })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  create(@Param('torneoId') torneoId: string, @Request() req: any, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(torneoId, req.user.id, dto);
  }

  @Get('tournament/:torneoId')
  @ApiOperation({ summary: 'Listar equipos de un torneo', description: 'Retorna todos los equipos inscritos en un torneo (HU-20)' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Lista de equipos', type: [TeamEntity] })
  findAll(@Param('torneoId') torneoId: string) {
    return this.teamsService.findAll(torneoId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un equipo', description: 'Retorna datos del equipo con sus jugadores (HU-21)' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  @ApiResponse({ status: 200, description: 'Detalle del equipo', type: TeamEntity })
  @ApiResponse({ status: 404, description: 'Equipo no encontrado' })
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar equipo', description: 'Edita nombre, escudo o teléfono — solo CAPITAN, ORGANIZADOR o STAFF' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  @ApiResponse({ status: 200, description: 'Equipo actualizado', type: TeamEntity })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar equipo', description: 'Elimina el equipo — solo ORGANIZADOR o STAFF' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  @ApiResponse({ status: 200, description: 'Equipo eliminado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.teamsService.remove(id, req.user.id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Unirse a un equipo', description: 'El usuario se une a un equipo mediante enlace de invitación (HU-17)' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  @ApiResponse({ status: 201, description: 'Unido al equipo exitosamente' })
  @ApiResponse({ status: 403, description: 'Ya eres miembro de este equipo' })
  joinTeam(@Param('id') id: string, @Request() req: any) {
    return this.teamsService.joinTeam(id, req.user.id);
  }
}