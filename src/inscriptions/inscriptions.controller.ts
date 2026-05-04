import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { InscriptionsService } from './inscriptions.service';
import { CreateInscriptionDto } from './dto/create-inscription.dto';
import { UpdateInscriptionDto } from './dto/update-inscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InscriptionEntity } from './entities/inscription.entity';

@ApiTags('Inscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inscriptions')
export class InscriptionsController {
  constructor(private readonly inscriptionsService: InscriptionsService) {}

  @Post('tournament/:torneoId')
  @ApiOperation({ summary: 'Solicitar inscripción', description: 'El capitán solicita inscribir su equipo a un torneo en estado EN_INSCRIPCION (HU-13)' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiResponse({ status: 201, description: 'Inscripción solicitada', type: InscriptionEntity })
  @ApiResponse({ status: 400, description: 'Torneo no en inscripción o cupo lleno' })
  @ApiResponse({ status: 403, description: 'Solo el capitán puede solicitar inscripción' })
  create(@Param('torneoId') torneoId: string, @Request() req: any, @Body() dto: CreateInscriptionDto) {
    return this.inscriptionsService.create(torneoId, req.user.id, dto);
  }

  @Get('tournament/:torneoId')
  @ApiOperation({ summary: 'Listar inscripciones', description: 'Lista todas las inscripciones de un torneo — solo ORGANIZADOR o STAFF (HU-14)' })
  @ApiParam({ name: 'torneoId', description: 'UUID del torneo' })
  @ApiResponse({ status: 200, description: 'Lista de inscripciones', type: [InscriptionEntity] })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  findAll(@Param('torneoId') torneoId: string, @Request() req: any) {
    return this.inscriptionsService.findAll(torneoId, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Aprobar o rechazar inscripción', description: 'Cambia el estado de una inscripción — solo ORGANIZADOR o STAFF (HU-14)' })
  @ApiParam({ name: 'id', description: 'UUID de la inscripción' })
  @ApiResponse({ status: 200, description: 'Estado actualizado', type: InscriptionEntity })
  @ApiResponse({ status: 400, description: 'Error de validación' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  updateStatus(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateInscriptionDto) {
    return this.inscriptionsService.updateStatus(id, req.user.id, dto);
  }
}