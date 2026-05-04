import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMatchDto } from './dto/update-match.dto';
import { EstadoPartido, RolTorneo } from '@prisma/client';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Ver detalle de un partido — HU-24
  async findOne(partidoId: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      include: {
        equipoLocal: { select: { id: true, nombre: true, escudo: true } },
        equipoVisitante: { select: { id: true, nombre: true, escudo: true } },
        campo: { select: { id: true, nombre: true, direccion: true } },
        torneo: { select: { id: true, nombre: true, fechaInicio: true, fechaFin: true } },
      },
    });

    if (!partido) throw new NotFoundException('Partido no encontrado');
    return partido;
  }

  // Editar fecha o cancha — CAPITAN, ORGANIZADOR o STAFF (si está PENDIENTE)
  async update(partidoId: string, userId: string, dto: UpdateMatchDto) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      include: { torneo: true },
    });
    if (!partido) throw new NotFoundException('Partido no encontrado');

    const rol = await this.getRol(partido.torneoId, userId);

    // Si está CONFIRMADO, solo ORGANIZADOR o STAFF pueden cambiar estado a PENDIENTE
    if (partido.estado === EstadoPartido.CONFIRMADO) {
      const rolesSuperiores: RolTorneo[] = [RolTorneo.ORGANIZADOR, RolTorneo.STAFF];
      if (!rolesSuperiores.includes(rol)) {
        throw new ForbiddenException('Solo el organizador o staff puede modificar un partido confirmado');
      }
      // Solo permite cambiar estado a PENDIENTE
      if (dto.estado && dto.estado !== EstadoPartido.PENDIENTE) {
        throw new BadRequestException('Un partido confirmado solo puede volver a PENDIENTE');
      }
    }

    // Validar que la fecha esté dentro del rango del torneo
    if (dto.fecha) {
      const fecha = new Date(dto.fecha);
      const fechaInicio = new Date(partido.torneo.fechaInicio);
      const fechaFin = new Date(partido.torneo.fechaFin);
      if (fecha < fechaInicio || fecha > fechaFin) {
        throw new BadRequestException(
          `La fecha debe estar entre ${fechaInicio.toLocaleDateString()} y ${fechaFin.toLocaleDateString()}`
        );
      }
    }

    // Validar que la cancha pertenece al torneo
    if (dto.campoId) {
      const campo = await this.prisma.campoJuego.findFirst({
        where: { id: dto.campoId, torneoId: partido.torneoId },
      });
      if (!campo) throw new BadRequestException('La cancha no pertenece a este torneo');
    }

    // CAPITAN solo puede editar si el partido está PENDIENTE
    if (rol === RolTorneo.CAPITAN && partido.estado !== EstadoPartido.PENDIENTE) {
      throw new ForbiddenException('El capitán solo puede editar partidos pendientes');
    }

    // CAPITAN no puede cambiar estado
    if (rol === RolTorneo.CAPITAN && dto.estado) {
      throw new ForbiddenException('El capitán no puede cambiar el estado del partido');
    }

    const updated = await this.prisma.partido.update({
      where: { id: partidoId },
      data: {
        ...(dto.estado && { estado: dto.estado }),
        ...(dto.fecha && { fecha: new Date(dto.fecha) }),
        ...(dto.campoId !== undefined && { campoId: dto.campoId }),
      },
      include: {
        equipoLocal: { select: { id: true, nombre: true } },
        equipoVisitante: { select: { id: true, nombre: true } },
        campo: { select: { id: true, nombre: true } },
      },
    });

    this.logger.log(`Partido ${partidoId} actualizado`);
    return updated;
  }

  // Confirmar partido — ORGANIZADOR o STAFF
  async confirm(partidoId: string, userId: string) {
    const partido = await this.prisma.partido.findUnique({ where: { id: partidoId } });
    if (!partido) throw new NotFoundException('Partido no encontrado');

    await this.checkOrganizadorOStaff(partido.torneoId, userId);

    if (partido.estado === EstadoPartido.CONFIRMADO) {
      throw new BadRequestException('El partido ya está confirmado');
    }

    const updated = await this.prisma.partido.update({
      where: { id: partidoId },
      data: { estado: EstadoPartido.CONFIRMADO },
    });

    this.logger.log(`Partido ${partidoId} confirmado`);
    return updated;
  }

  private async getRol(torneoId: string, userId: string): Promise<RolTorneo> {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    if (!participacion) throw new ForbiddenException('No participas en este torneo');
    return participacion.rol;
  }

  private async checkOrganizadorOStaff(torneoId: string, userId: string) {
    const rol = await this.getRol(torneoId, userId);
    const rolesPermitidos: RolTorneo[] = [RolTorneo.ORGANIZADOR, RolTorneo.STAFF];
    if (!rolesPermitidos.includes(rol)) {
      throw new ForbiddenException('Solo el organizador o staff puede realizar esta acción');
    }
  }
}