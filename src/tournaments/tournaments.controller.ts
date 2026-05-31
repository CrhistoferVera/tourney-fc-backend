import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Crear torneo',
    description:
      'Crea un torneo y asigna al usuario como ORGANIZADOR (HU-6, HU-7, HU-8)',
  })
  @ApiResponse({
    status: 201,
    description: 'Torneo creado en estado BORRADOR',
    type: TournamentEntity,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  create(@Request() req: any, @Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Buscar torneos disponibles',
    description:
      'Lista torneos públicos en estado EN_INSCRIPCION o EN_CURSO (HU-12)',
  })
  @ApiQuery({
    name: 'nombre',
    required: false,
    description: 'Filtrar por nombre',
  })
  @ApiQuery({ name: 'zona', required: false, description: 'Filtrar por zona' })
  @ApiResponse({
    status: 200,
    description: 'Lista de torneos disponibles',
    type: [TournamentEntity],
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  findAll(@Query() query: QueryTournamentDto) {
    return this.tournamentsService.findAll(query);
  }

  @Get('my')
  @ApiOperation({
    summary: 'Mis torneos',
    description:
      'Lista los torneos donde participa el usuario autenticado con su rol (HU-5)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de torneos del usuario ordenados por estado',
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  findMy(@Request() req: any) {
    return this.tournamentsService.findMy(req.user.id);
  }

  @Get(':id/estadisticas')
  @ApiOperation({
    summary: 'Estadísticas globales del torneo',
    description:
      'Retorna liderazgos y resumen del torneo. CAPITAN/JUGADOR también reciben sus estadísticas personales.',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Estadísticas del torneo' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  getEstadisticas(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.getEstadisticas(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un torneo',
    description:
      'Retorna datos completos del torneo incluyendo rol del usuario',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del torneo',
    type: TournamentEntity,
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar torneo',
    description:
      'Actualiza datos del torneo — solo el ORGANIZADOR puede hacerlo (HU-10)',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({
    status: 200,
    description: 'Torneo actualizado',
    type: TournamentEntity,
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({
    status: 403,
    description: 'Solo el organizador puede editar el torneo',
  })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournamentsService.update(id, req.user.id, dto);
  }

  @Patch(':id/publish')
  @ApiOperation({
    summary: 'Publicar torneo',
    description: 'Cambia el estado de BORRADOR a EN_INSCRIPCION (HU-11)',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({
    status: 200,
    description: 'Torneo publicado en estado EN_INSCRIPCION',
  })
  @ApiResponse({
    status: 400,
    description: 'El torneo no está en estado BORRADOR',
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({
    status: 403,
    description: 'Solo el organizador puede publicar el torneo',
  })
  publish(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.publish(id, req.user.id);
  }

  @Patch(':id/start')
  @ApiOperation({
    summary: 'Iniciar torneo',
    description:
      'Cambia el estado de EN_INSCRIPCION a EN_CURSO — solo ORGANIZADOR',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({
    status: 200,
    description: 'Torneo iniciado en estado EN_CURSO',
  })
  @ApiResponse({
    status: 400,
    description:
      'El torneo no tiene fixture generado o no está en EN_INSCRIPCION',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el organizador puede iniciar el torneo',
  })
  start(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.startTournament(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar torneo',
    description: 'Elimina el torneo — solo el ORGANIZADOR puede hacerlo',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Torneo eliminado exitosamente' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({
    status: 403,
    description: 'Solo el organizador puede eliminar el torneo',
  })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.remove(id, req.user.id);
  }

  @Post(':id/staff')
  @ApiOperation({
    summary: 'Agregar staff pendiente',
    description:
      'Guarda un correo como staff pendiente del torneo — se asigna y notifica al publicar',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 201, description: 'Staff guardado correctamente' })
  @ApiResponse({ status: 400, description: 'Torneo no está en estado válido' })
  @ApiResponse({
    status: 403,
    description: 'Solo el organizador puede agregar staff',
  })
  async addStaff(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { email: string },
  ) {
    return this.tournamentsService.addStaffPendiente(
      id,
      req.user.id,
      body.email,
    );
  }

  @Get(':id/staff')
  @ApiOperation({
    summary: 'Listar staff del torneo',
    description: 'Retorna los staff pendientes y los ya aceptados — solo ORGANIZADOR',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Staff pendientes y aceptados' })
  @ApiResponse({ status: 403, description: 'Solo el organizador puede ver el staff' })
  @ApiResponse({ status: 404, description: 'Torneo no encontrado' })
  getStaff(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.getStaff(id, req.user.id);
  }

  @Get(':id/inscripciones')
  @ApiOperation({ summary: 'Listar solicitudes de inscripción pendientes — solo ORGANIZADOR' })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Solicitudes pendientes con datos del equipo' })
  getInscripciones(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.getInscripciones(id, req.user.id);
  }

  @Patch(':id/inscripciones/:inscripcionId/aprobar')
  @ApiOperation({ summary: 'Aprobar solicitud de inscripción — solo ORGANIZADOR' })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiParam({ name: 'inscripcionId', description: 'UUID de la inscripción' })
  @ApiResponse({ status: 200, description: 'Equipo aprobado' })
  aprobarInscripcion(
    @Param('id') id: string,
    @Param('inscripcionId') inscripcionId: string,
    @Request() req: any,
  ) {
    return this.tournamentsService.responderInscripcion(id, inscripcionId, req.user.id, 'aprobar');
  }

  @Patch(':id/inscripciones/:inscripcionId/rechazar')
  @ApiOperation({ summary: 'Rechazar solicitud de inscripción — solo ORGANIZADOR' })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiParam({ name: 'inscripcionId', description: 'UUID de la inscripción' })
  @ApiResponse({ status: 200, description: 'Equipo rechazado' })
  rechazarInscripcion(
    @Param('id') id: string,
    @Param('inscripcionId') inscripcionId: string,
    @Request() req: any,
  ) {
    return this.tournamentsService.responderInscripcion(id, inscripcionId, req.user.id, 'rechazar');
  }

  @Post(':id/campos')
  @ApiOperation({
    summary: 'Agregar cancha a un torneo',
    description: 'Permite agregar una cancha/campo de juego al torneo, incluso si está EN_CURSO — solo ORGANIZADOR',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 201, description: 'Cancha agregada' })
  addCampo(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { nombre: string; direccion?: string },
  ) {
    return this.tournamentsService.addCampo(id, req.user.id, body);
  }

  @Get(':id/campos')
  @ApiOperation({
    summary: 'Listar canchas del torneo',
    description: 'Retorna las canchas registradas para el torneo',
  })
  @ApiParam({ name: 'id', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Lista de canchas' })
  getCampos(@Param('id') id: string) {
    return this.tournamentsService.getCampos(id);
  }

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('image'))
  @ApiOperation({ summary: 'Subir imagen del torneo' })
  @ApiResponse({ status: 201, description: 'Imagen subida correctamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido' })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ninguna imagen');
    return this.tournamentsService.uploadImage(file);
  }
}
