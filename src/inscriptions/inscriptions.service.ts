import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscriptionDto } from './dto/create-inscription.dto';
import { UpdateInscriptionDto } from './dto/update-inscription.dto';
import { EstadoInscripcion, EstadoTorneo, RolTorneo } from '@prisma/client';

@Injectable()
export class InscriptionsService {
  private readonly logger = new Logger(InscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Solicitar inscripción — HU-13
  async create(torneoId: string, userId: string, dto: CreateInscriptionDto) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id: torneoId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    if (torneo.estado !== EstadoTorneo.EN_INSCRIPCION) {
      throw new BadRequestException('El torneo no está en período de inscripción');
    }

    const equipo = await this.prisma.equipo.findUnique({ where: { id: dto.equipoId } });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    // Verificar que el usuario es capitán del equipo
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    if (!participacion || participacion.rol !== RolTorneo.CAPITAN) {
      throw new ForbiddenException('Solo el capitán puede solicitar inscripción');
    }

    // Verificar si ya existe inscripción
    const existente = await this.prisma.inscripcion.findUnique({
      where: { equipoId: dto.equipoId },
    });
    if (existente) throw new BadRequestException('Este equipo ya tiene una inscripción');

    // Verificar cupo
    const inscripcionesAprobadas = await this.prisma.inscripcion.count({
      where: { torneoId, estado: EstadoInscripcion.APROBADA },
    });
    if (inscripcionesAprobadas >= torneo.maxEquipos) {
      throw new BadRequestException('El torneo ya alcanzó el cupo máximo de equipos');
    }

    const inscripcion = await this.prisma.inscripcion.create({
      data: { torneoId, equipoId: dto.equipoId, estado: EstadoInscripcion.PENDIENTE },
      include: { equipo: true, torneo: { select: { nombre: true } } },
    });

    this.logger.log(`Inscripción creada: ${inscripcion.id}`);
    return inscripcion;
  }

  // Listar inscripciones de un torneo — HU-14
  async findAll(torneoId: string, userId: string) {
    await this.checkOrganizadorOStaff(torneoId, userId);

    return this.prisma.inscripcion.findMany({
      where: { torneoId },
      include: {
        equipo: {
          include: {
            jugadores: {
              include: {
                usuario: { select: { id: true, nombre: true, fotoPerfil: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Aprobar o rechazar inscripción — HU-14
  async updateStatus(inscripcionId: string, userId: string, dto: UpdateInscriptionDto) {
    const inscripcion = await this.prisma.inscripcion.findUnique({
      where: { id: inscripcionId },
      include: { torneo: true },
    });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    await this.checkOrganizadorOStaff(inscripcion.torneoId, userId);

    if (inscripcion.estado === EstadoInscripcion.APROBADA && dto.estado === EstadoInscripcion.APROBADA) {
      throw new BadRequestException('La inscripción ya está aprobada');
    }

    // Verificar cupo si se está aprobando
    if (dto.estado === EstadoInscripcion.APROBADA) {
      const aprobadas = await this.prisma.inscripcion.count({
        where: { torneoId: inscripcion.torneoId, estado: EstadoInscripcion.APROBADA },
      });
      if (aprobadas >= inscripcion.torneo.maxEquipos) {
        throw new BadRequestException('El torneo ya alcanzó el cupo máximo');
      }
    }

    const updated = await this.prisma.inscripcion.update({
      where: { id: inscripcionId },
      data: { estado: dto.estado },
      include: { equipo: true },
    });

    this.logger.log(`Inscripción ${inscripcionId} actualizada a: ${dto.estado}`);
    return updated;
  }

  private async checkOrganizadorOStaff(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    const rolesPermitidos = [RolTorneo.ORGANIZADOR, RolTorneo.STAFF];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException('Solo el organizador o staff puede gestionar inscripciones');
    }
  }
}