import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscriptionDto } from './dto/create-inscription.dto';
import { UpdateInscriptionDto } from './dto/update-inscription.dto';
import {
  EstadoInscripcion,
  EstadoTorneo,
  ModalidadFutbol,
  RolTorneo,
} from '@prisma/client';

const MIN_JUGADORES_POR_MODALIDAD: Record<ModalidadFutbol, number> = {
  FUTBOL_5: 5,
  FUTBOL_7: 7,
  FUTBOL_11: 11,
};

const MAX_JUGADORES_DEFAULT_POR_MODALIDAD: Record<ModalidadFutbol, number> = {
  FUTBOL_5: 10,
  FUTBOL_7: 14,
  FUTBOL_11: 22,
};

@Injectable()
export class InscriptionsService {
  private readonly logger = new Logger(InscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Solicitar inscripción con roster
  async create(torneoId: string, userId: string, dto: CreateInscriptionDto) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id: torneoId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    if (torneo.estado !== EstadoTorneo.EN_INSCRIPCION) {
      throw new BadRequestException('El torneo no está en período de inscripción');
    }

    const equipo = await this.prisma.equipo.findUnique({
      where: { id: dto.equipoId },
      include: { jugadores: { select: { usuarioId: true } } },
    });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    if (equipo.capitanId !== userId) {
      throw new ForbiddenException('Solo el capitán del equipo puede solicitar la inscripción');
    }

    const existente = await this.prisma.inscripcion.findUnique({
      where: { torneoId_equipoId: { torneoId, equipoId: equipo.id } },
    });
    if (existente && existente.estado !== EstadoInscripcion.RECHAZADA) {
      throw new BadRequestException('Este equipo ya tiene una inscripción en este torneo');
    }

    await this.assertCupoDisponible(torneoId, torneo.maxEquipos);
    this.validarRoster(equipo, dto.jugadoresIds, torneo.modalidad, torneo.maxJugadoresPorEquipo);
    await this.assertSinConflictoJugadores(torneoId, dto.jugadoresIds, existente?.id);

    // Crear (o resucitar) inscripción + roster en una transacción
    const inscripcion = await this.prisma.$transaction(async (tx) => {
      if (existente) {
        await tx.inscripcionRoster.deleteMany({ where: { inscripcionId: existente.id } });
        return tx.inscripcion.update({
          where: { id: existente.id },
          data: {
            estado: EstadoInscripcion.PENDIENTE,
            roster: {
              create: dto.jugadoresIds.map((usuarioId) => ({ usuarioId })),
            },
          },
          include: {
            equipo: true,
            roster: { include: { usuario: { select: { id: true, nombre: true, fotoPerfil: true } } } },
          },
        });
      }
      return tx.inscripcion.create({
        data: {
          torneoId,
          equipoId: equipo.id,
          estado: EstadoInscripcion.PENDIENTE,
          roster: {
            create: dto.jugadoresIds.map((usuarioId) => ({ usuarioId })),
          },
        },
        include: {
          equipo: true,
          roster: { include: { usuario: { select: { id: true, nombre: true, fotoPerfil: true } } } },
        },
      });
    });

    this.logger.log(
      `Inscripción creada: ${inscripcion.id} (equipo ${equipo.id}, ${dto.jugadoresIds.length} jugadores)`,
    );
    return this.shapeInscripcion(inscripcion);
  }

  async findAll(torneoId: string, userId: string) {
    await this.checkOrganizadorOStaff(torneoId, userId);

    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { torneoId },
      include: {
        equipo: true,
        roster: {
          include: {
            usuario: {
              select: { id: true, nombre: true, fotoPerfil: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return inscripciones.map((ins) => this.shapeInscripcion(ins));
  }

  async updateStatus(
    inscripcionId: string,
    userId: string,
    dto: UpdateInscriptionDto,
  ) {
    const inscripcion = await this.prisma.inscripcion.findUnique({
      where: { id: inscripcionId },
      include: { torneo: true, roster: true, equipo: true },
    });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    await this.checkOrganizadorOStaff(inscripcion.torneoId, userId);

    if (
      inscripcion.estado === EstadoInscripcion.APROBADA &&
      dto.estado === EstadoInscripcion.APROBADA
    ) {
      throw new BadRequestException('La inscripción ya está aprobada');
    }

    if (dto.estado === EstadoInscripcion.APROBADA) {
      const aprobadas = await this.prisma.inscripcion.count({
        where: { torneoId: inscripcion.torneoId, estado: EstadoInscripcion.APROBADA },
      });
      if (aprobadas >= inscripcion.torneo.maxEquipos) {
        throw new BadRequestException('El torneo ya alcanzó el cupo máximo');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.inscripcion.update({
        where: { id: inscripcionId },
        data: { estado: dto.estado },
        include: {
          equipo: true,
          roster: {
            include: {
              usuario: {
                select: { id: true, nombre: true, fotoPerfil: true, email: true },
              },
            },
          },
        },
      });

      if (dto.estado === EstadoInscripcion.APROBADA) {
        // Asignar roles: CAPITAN al capitán del equipo, JUGADOR al resto del roster
        for (const r of inscripcion.roster) {
          const rol =
            r.usuarioId === inscripcion.equipo.capitanId
              ? RolTorneo.CAPITAN
              : RolTorneo.JUGADOR;
          await tx.usuarioTorneo.upsert({
            where: {
              usuarioId_torneoId: {
                usuarioId: r.usuarioId,
                torneoId: inscripcion.torneoId,
              },
            },
            update: { rol },
            create: {
              usuarioId: r.usuarioId,
              torneoId: inscripcion.torneoId,
              rol,
            },
          });
        }
      }

      return upd;
    });

    this.logger.log(
      `Inscripción ${inscripcionId} actualizada a: ${dto.estado}`,
    );
    return this.shapeInscripcion(updated);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private shapeInscripcion(ins: any) {
    return {
      id: ins.id,
      torneoId: ins.torneoId,
      equipoId: ins.equipoId,
      estado: ins.estado,
      createdAt: ins.createdAt,
      equipo: {
        id: ins.equipo.id,
        nombre: ins.equipo.nombre,
        escudo: ins.equipo.escudo,
        telefonoCapitan: ins.equipo.telefonoCapitan,
        cantidadJugadores: ins.roster?.length ?? 0,
        jugadores: (ins.roster ?? []).map((r: any) => ({
          id: r.usuario.id,
          nombre: r.usuario.nombre,
          fotoPerfil: r.usuario.fotoPerfil,
          email: r.usuario.email ?? undefined,
        })),
      },
      roster: (ins.roster ?? []).map((r: any) => ({
        id: r.usuario.id,
        nombre: r.usuario.nombre,
        fotoPerfil: r.usuario.fotoPerfil,
      })),
    };
  }

  private async assertCupoDisponible(torneoId: string, maxEquipos: number) {
    const aprobados = await this.prisma.inscripcion.count({
      where: { torneoId, estado: EstadoInscripcion.APROBADA },
    });
    if (aprobados >= maxEquipos) {
      throw new BadRequestException('El torneo ya alcanzó el cupo máximo de equipos');
    }
  }

  private validarRoster(
    equipo: { capitanId: string; jugadores: { usuarioId: string }[] },
    jugadoresIds: string[],
    modalidad: ModalidadFutbol | null,
    maxConfig: number | null,
  ) {
    const jugadoresIdsSet = new Set(jugadoresIds);
    if (jugadoresIdsSet.size !== jugadoresIds.length) {
      throw new BadRequestException('La lista de jugadores tiene duplicados');
    }

    const miembrosIds = new Set(equipo.jugadores.map((j) => j.usuarioId));
    for (const jId of jugadoresIds) {
      if (!miembrosIds.has(jId)) {
        throw new BadRequestException(`El jugador ${jId} no pertenece al equipo`);
      }
    }

    if (!jugadoresIdsSet.has(equipo.capitanId)) {
      throw new BadRequestException('El capitán debe estar en el roster del torneo');
    }

    const { min, max } = this.rangoJugadores(modalidad, maxConfig);
    if (jugadoresIds.length < min) {
      throw new BadRequestException(
        `Debes seleccionar al menos ${min} jugadores para esta modalidad`,
      );
    }
    if (jugadoresIds.length > max) {
      throw new BadRequestException(`El máximo permitido es ${max} jugadores`);
    }
  }

  private async assertSinConflictoJugadores(
    torneoId: string,
    jugadoresIds: string[],
    excluirInscripcionId?: string,
  ) {
    const conflictos = await this.prisma.inscripcionRoster.findMany({
      where: {
        usuarioId: { in: jugadoresIds },
        inscripcion: {
          torneoId,
          estado: { in: [EstadoInscripcion.PENDIENTE, EstadoInscripcion.APROBADA] },
          ...(excluirInscripcionId ? { NOT: { id: excluirInscripcionId } } : {}),
        },
      },
      include: { usuario: { select: { nombre: true } } },
    });
    if (conflictos.length > 0) {
      const nombres = conflictos.map((c) => c.usuario.nombre).join(', ');
      throw new BadRequestException(
        `Estos jugadores ya están inscritos en este torneo con otro equipo: ${nombres}`,
      );
    }
  }

  private rangoJugadores(
    modalidad: ModalidadFutbol | null,
    maxConfig: number | null,
  ): { min: number; max: number } {
    const min = modalidad ? MIN_JUGADORES_POR_MODALIDAD[modalidad] : 1;
    const defaultMax = modalidad ? MAX_JUGADORES_DEFAULT_POR_MODALIDAD[modalidad] : 30;
    const max = maxConfig && maxConfig > 0 ? maxConfig : defaultMax;
    return { min, max };
  }

  private async checkOrganizadorOStaff(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    const rolesPermitidos: RolTorneo[] = [RolTorneo.ORGANIZADOR, RolTorneo.STAFF];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException(
        'Solo el organizador o staff puede gestionar inscripciones',
      );
    }
  }
}
