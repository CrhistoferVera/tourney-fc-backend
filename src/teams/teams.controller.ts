import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateInviteLinkDto } from './dto/invite-link.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // ─── Equipos globales ────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Crear equipo global',
    description: 'Crea un equipo independiente de torneos. El usuario queda como capitán.',
  })
  @ApiResponse({ status: 201, description: 'Equipo creado' })
  createGlobal(@Request() req: any, @Body() dto: CreateTeamDto) {
    return this.teamsService.createGlobal(req.user.id, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Listar mis equipos (como capitán o jugador)' })
  @ApiResponse({ status: 200, description: 'Lista de equipos' })
  getMyTeams(@Request() req: any) {
    return this.teamsService.getMyTeams(req.user.id);
  }

  // ─── Upload (debe ir antes que /:id) ─────────────────────────────────────

  @Post('upload-escudo')
  @UseInterceptors(FileInterceptor('image'))
  @ApiOperation({ summary: 'Subir escudo de equipo' })
  @ApiResponse({ status: 201, description: 'Escudo subido correctamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido' })
  async uploadEscudo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ninguna imagen');
    return this.teamsService.uploadEscudo(file);
  }

  // ─── Vistas en contexto de torneo (antes que /:id) ───────────────────────

  @Get('tournament/:torneoId')
  @ApiOperation({
    summary: 'Listar equipos APROBADOS de un torneo',
  })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Lista de equipos' })
  findAllByTournament(@Param('torneoId') torneoId: string) {
    return this.teamsService.findAllByTournament(torneoId);
  }

  @Get('tournament/:torneoId/my-team')
  @ApiOperation({ summary: 'Obtener mi equipo (roster) en un torneo' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  getMyTeamInTournament(@Param('torneoId') torneoId: string, @Request() req: any) {
    return this.teamsService.getMyTeam(torneoId, req.user.id);
  }

  // ─── Enlace de invitación (rutas estáticas antes que /:id) ───────────────

  @Get('join/:code/preview')
  @ApiOperation({ summary: 'Previsualizar enlace de invitación' })
  @ApiParam({ name: 'code', description: 'Código del enlace' })
  preview(@Param('code') code: string, @Request() req: any) {
    return this.teamsService.previewInviteLink(code, req.user?.id);
  }

  @Post('join/:code')
  @ApiOperation({ summary: 'Canjear enlace de invitación' })
  @ApiParam({ name: 'code', description: 'Código del enlace' })
  joinByCode(@Param('code') code: string, @Request() req: any) {
    return this.teamsService.joinByCode(code, req.user.id);
  }

  // ─── Detalle / mutación de un equipo concreto ────────────────────────────

  @Get(':id/in-tournament/:torneoId')
  @ApiOperation({ summary: 'Detalle de un equipo en el contexto de un torneo (roster + stats)' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  findOneInTournament(@Param('id') id: string, @Param('torneoId') torneoId: string) {
    return this.teamsService.findOneInTournament(id, torneoId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un equipo global' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.teamsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar equipo — solo capitán' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar equipo — solo capitán' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.teamsService.remove(id, req.user.id);
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: 'Salir del equipo (jugador no-capitán)' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  leave(@Param('id') id: string, @Request() req: any) {
    return this.teamsService.leaveTeam(id, req.user.id);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Eliminar jugador del equipo — solo capitán' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  @ApiParam({ name: 'userId', description: 'UUID del jugador a eliminar' })
  removePlayer(@Param('id') id: string, @Param('userId') targetUserId: string, @Request() req: any) {
    return this.teamsService.removePlayer(id, req.user.id, targetUserId);
  }

  @Post(':id/invite-player')
  @ApiOperation({ summary: 'Invitar jugador por correo — solo capitán' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  invitePlayer(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { email: string },
  ) {
    return this.teamsService.invitePlayer(id, req.user.id, body.email);
  }

  @Post(':id/invite-link')
  @ApiOperation({ summary: 'Generar enlace de invitación — solo capitán' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  createInviteLink(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: CreateInviteLinkDto,
  ) {
    return this.teamsService.createInviteLink(id, req.user.id, dto);
  }

  @Delete(':id/invite-link')
  @ApiOperation({ summary: 'Revocar enlace de invitación — solo capitán' })
  @ApiParam({ name: 'id', description: 'UUID del equipo' })
  revokeInviteLink(@Param('id') id: string, @Request() req: any) {
    return this.teamsService.revokeInviteLink(id, req.user.id);
  }
}
