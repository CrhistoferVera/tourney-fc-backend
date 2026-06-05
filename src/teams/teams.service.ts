import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateInviteLinkDto } from './dto/invite-link.dto';
import {
  EstadoInvitacion,
  EstadoTorneo,
  TipoEvento,
  TipoInvitacion,
} from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

const DEFAULT_INVITE_LINK_DAYS = 7;
const INVITE_LINK_BASE_URL =
  process.env.INVITE_LINK_BASE_URL ?? 'https://tourneyfc.app/join';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ─── Escudo upload ─────────────────────────────────────────────────────────

  async uploadEscudo(file: Express.Multer.File) {
    const result = await this.cloudinaryService.uploadStream(file.buffer, 'escudos');
    return { url: result.secure_url };
  }

  // ─── Equipo global: CRUD ───────────────────────────────────────────────────

  async createGlobal(userId: string, dto: CreateTeamDto) {
    const equipo = await this.prisma.equipo.create({
      data: {
        nombre: dto.nombre,
        escudo: dto.escudo,
        telefonoCapitan: dto.telefonoCapitan,
        capitanId: userId,
        jugadores: {
          create: { usuarioId: userId },
        },
      },
    });
    this.logger.log(`Equipo global creado: ${equipo.id} por capitán ${userId}`);
    return this.buildMyTeam(equipo.id);
  }

  async getMyTeams(userId: string) {
    const equipos = await this.prisma.equipo.findMany({
      where: {
        OR: [
          { jugadores: { some: { usuarioId: userId } } },
          { capitanId: userId },
        ],
      },
      include: { _count: { select: { jugadores: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return equipos.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      escudo: e.escudo,
      capitanId: e.capitanId,
      cantidadJugadores: e._count.jugadores,
      esCapitan: e.capitanId === userId,
    }));
  }

  // Detalle global de un equipo (sin contexto de torneo)
  async findOne(equipoId: string, userId?: string) {
    return this.buildMyTeam(equipoId, userId);
  }

  private async buildMyTeam(equipoId: string, viewerId?: string) {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id: equipoId },
      include: {
        jugadores: {
          include: {
            usuario: {
              select: { id: true, nombre: true, fotoPerfil: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        invitaciones: {
          where: { tipo: TipoInvitacion.JUGADOR, estado: EstadoInvitacion.PENDIENTE },
          select: { id: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        enlaceInvitacion: true,
      },
    });

    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    const isCapitan = viewerId !== undefined && equipo.capitanId === viewerId;
    const inviteLink =
      isCapitan && equipo.enlaceInvitacion
        ? {
            code: equipo.enlaceInvitacion.codigo,
            url: `${INVITE_LINK_BASE_URL}/${equipo.enlaceInvitacion.codigo}`,
            expiresAt: equipo.enlaceInvitacion.expiresAt,
          }
        : null;

    return {
      id: equipo.id,
      nombre: equipo.nombre,
      escudo: equipo.escudo,
      telefonoCapitan: equipo.telefonoCapitan,
      cantidadJugadores: equipo.cantidadJugadores ?? equipo.jugadores.length,
      capitanId: equipo.capitanId,
      jugadores: equipo.jugadores.map((j) => ({
        id: j.id,
        usuarioId: j.usuarioId,
        equipoId: j.equipoId,
        createdAt: j.createdAt,
        usuario: j.usuario,
      })),
      invitaciones: equipo.invitaciones,
      inviteLink,
    };
  }

  async update(equipoId: string, userId: string, dto: UpdateTeamDto) {
    const equipo = await this.requireCapitan(equipoId, userId);
    await this.prisma.equipo.update({
      where: { id: equipo.id },
      data: {
        nombre: dto.nombre,
        escudo: dto.escudo,
        telefonoCapitan: dto.telefonoCapitan,
      },
    });
    this.logger.log(`Equipo actualizado: ${equipo.id}`);
    return this.buildMyTeam(equipo.id, userId);
  }

  async remove(equipoId: string, userId: string) {
    const equipo = await this.requireCapitan(equipoId, userId);

    const bloqueante = await this.prisma.inscripcion.findFirst({
      where: {
        equipoId: equipo.id,
        estado: 'APROBADA',
        torneo: { estado: { in: [EstadoTorneo.EN_CURSO, EstadoTorneo.FINALIZADO] } },
      },
    });
    if (bloqueante) {
      throw new BadRequestException(
        'No puedes eliminar el equipo: tiene inscripción aprobada en un torneo en curso o finalizado.',
      );
    }

    await this.prisma.equipo.delete({ where: { id: equipo.id } });
    this.logger.log(`Equipo eliminado: ${equipo.id}`);
    return { mensaje: 'Equipo eliminado exitosamente' };
  }

  async leaveTeam(equipoId: string, userId: string) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id: equipoId } });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');
    if (equipo.capitanId === userId) {
      throw new BadRequestException(
        'El capitán no puede salir del equipo. Transfiere la capitanía o elimina el equipo.',
      );
    }

    const miembro = await this.prisma.usuarioEquipo.findUnique({
      where: { usuarioId_equipoId: { usuarioId: userId, equipoId } },
    });
    if (!miembro) throw new NotFoundException('No formas parte de este equipo');

    const enRosterActivo = await this.prisma.inscripcionRoster.findFirst({
      where: {
        usuarioId: userId,
        inscripcion: {
          equipoId,
          estado: 'APROBADA',
          torneo: { estado: EstadoTorneo.EN_CURSO },
        },
      },
    });
    if (enRosterActivo) {
      throw new BadRequestException(
        'No puedes salir: estás en el roster de un torneo en curso.',
      );
    }

    await this.prisma.usuarioEquipo.delete({ where: { id: miembro.id } });
    this.logger.log(`Usuario ${userId} salió del equipo ${equipoId}`);
    return { mensaje: 'Has salido del equipo' };
  }

  async removePlayer(equipoId: string, capitanId: string, targetUserId: string) {
    const equipo = await this.requireCapitan(equipoId, capitanId);

    if (targetUserId === capitanId) {
      throw new BadRequestException('No puedes eliminarte a ti mismo del equipo');
    }

    const miembro = await this.prisma.usuarioEquipo.findUnique({
      where: { usuarioId_equipoId: { usuarioId: targetUserId, equipoId } },
    });
    if (!miembro) throw new NotFoundException('El usuario no es miembro del equipo');

    const enRosterActivo = await this.prisma.inscripcionRoster.findFirst({
      where: {
        usuarioId: targetUserId,
        inscripcion: {
          equipoId,
          estado: 'APROBADA',
          torneo: { estado: EstadoTorneo.EN_CURSO },
        },
      },
    });
    if (enRosterActivo) {
      throw new BadRequestException(
        'No puedes eliminar a este jugador: está en el roster de un torneo en curso.',
      );
    }

    await this.prisma.usuarioEquipo.delete({ where: { id: miembro.id } });
    this.logger.log(`Capitán ${capitanId} eliminó al usuario ${targetUserId} del equipo ${equipoId}`);
    return { mensaje: 'Jugador eliminado del equipo' };
  }

  // ─── Invitación por correo ─────────────────────────────────────────────────

  async invitePlayer(equipoId: string, userId: string, email: string) {
    const equipo = await this.requireCapitan(equipoId, userId);

    const invitado = await this.prisma.usuario.findUnique({ where: { email } });
    if (!invitado) throw new NotFoundException('No se encontró un usuario con ese correo');
    if (invitado.id === userId) throw new BadRequestException('No puedes invitarte a ti mismo');

    const yaEnEquipo = await this.prisma.usuarioEquipo.findUnique({
      where: { usuarioId_equipoId: { usuarioId: invitado.id, equipoId: equipo.id } },
    });
    if (yaEnEquipo) throw new BadRequestException('Este usuario ya es miembro de tu equipo');

    const yaInvitado = await this.prisma.invitacionPendiente.findFirst({
      where: {
        equipoId: equipo.id,
        email,
        tipo: TipoInvitacion.JUGADOR,
        estado: EstadoInvitacion.PENDIENTE,
      },
    });
    if (yaInvitado) {
      throw new BadRequestException('Ya hay una invitación pendiente para este correo.');
    }

    await this.prisma.invitacionPendiente.create({
      data: {
        torneoId: null,
        equipoId: equipo.id,
        email,
        tipo: TipoInvitacion.JUGADOR,
        estado: EstadoInvitacion.PENDIENTE,
        invitadoPor: userId,
        usuarioId: invitado.id,
      },
    });

    this.logger.log(`Capitán ${userId} invitó a ${email} al equipo ${equipo.id}`);
    return { mensaje: 'Jugador invitado correctamente' };
  }

  // ─── Enlace de invitación ──────────────────────────────────────────────────

  // Solo puede haber un enlace activo por equipo. El upsert reemplaza el anterior
  // y reinicia el contador de usos, lo que invalida cualquier link viejo compartido.
  async createInviteLink(
    equipoId: string,
    userId: string,
    dto: CreateInviteLinkDto,
  ) {
    const equipo = await this.requireCapitan(equipoId, userId);

    const dias = dto.expiraEnDias ?? DEFAULT_INVITE_LINK_DAYS;
    const expiresAt = dias > 0 ? new Date(Date.now() + dias * 86_400_000) : null;

    const link = await this.prisma.enlaceInvitacion.upsert({
      where: { equipoId: equipo.id },
      update: { expiresAt, usos: 0 },
      create: {
        equipoId: equipo.id,
        creadoPor: userId,
        expiresAt,
      },
    });

    return {
      code: link.codigo,
      url: `${INVITE_LINK_BASE_URL}/${link.codigo}`,
      expiresAt: link.expiresAt,
    };
  }

  async revokeInviteLink(equipoId: string, userId: string) {
    await this.requireCapitan(equipoId, userId);
    await this.prisma.enlaceInvitacion.deleteMany({ where: { equipoId } });
    return { mensaje: 'Enlace revocado' };
  }

  async previewInviteLink(code: string, viewerId?: string) {
    const link = await this.prisma.enlaceInvitacion.findUnique({
      where: { codigo: code },
      include: {
        equipo: {
          include: {
            capitan: { select: { nombre: true } },
            _count: { select: { jugadores: true } },
          },
        },
      },
    });
    if (!link) throw new NotFoundException('Enlace inválido o expirado');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Enlace inválido o expirado');
    }

    let yaEsMiembro = false;
    if (viewerId) {
      const m = await this.prisma.usuarioEquipo.findUnique({
        where: { usuarioId_equipoId: { usuarioId: viewerId, equipoId: link.equipoId } },
      });
      yaEsMiembro = !!m;
    }

    return {
      teamId: link.equipo.id,
      nombre: link.equipo.nombre,
      escudo: link.equipo.escudo,
      capitanNombre: link.equipo.capitan.nombre,
      cantidadJugadores: link.equipo._count.jugadores,
      expiresAt: link.expiresAt,
      yaEsMiembro,
    };
  }

  // Se registra al usuario en el equipo y se incrementa el contador de usos en una
  // transacción para que no queden usuarios sin equipo si falla el update del enlace.
  async joinByCode(code: string, userId: string) {
    const link = await this.prisma.enlaceInvitacion.findUnique({
      where: { codigo: code },
      include: { equipo: true },
    });
    if (!link) throw new NotFoundException('Enlace inválido o expirado');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Enlace inválido o expirado');
    }

    const yaEsMiembro = await this.prisma.usuarioEquipo.findUnique({
      where: { usuarioId_equipoId: { usuarioId: userId, equipoId: link.equipoId } },
    });
    if (yaEsMiembro) {
      throw new BadRequestException('Ya formas parte de este equipo');
    }

    await this.prisma.$transaction([
      this.prisma.usuarioEquipo.create({
        data: { usuarioId: userId, equipoId: link.equipoId },
      }),
      this.prisma.enlaceInvitacion.update({
        where: { id: link.id },
        data: { usos: { increment: 1 } },
      }),
    ]);

    this.logger.log(`Usuario ${userId} se unió al equipo ${link.equipoId} via enlace`);
    return { teamId: link.equipoId, nombre: link.equipo.nombre };
  }

  // Detalle de un equipo en el contexto de un torneo (roster + stats)
  async findOneInTournament(equipoId: string, torneoId: string) {
    const inscripcion = await this.prisma.inscripcion.findUnique({
      where: { torneoId_equipoId: { torneoId, equipoId } },
      include: {
        equipo: {
          include: {
            jugadores: {
              include: {
                usuario: {
                  select: { id: true, nombre: true, fotoPerfil: true, email: true },
                },
              },
            },
          },
        },
        roster: {
          include: {
            usuario: {
              select: { id: true, nombre: true, fotoPerfil: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!inscripcion) throw new NotFoundException('Equipo no encontrado en este torneo');

    const useRoster = inscripcion.roster.length > 0;
    const baseJugadores = useRoster ? inscripcion.roster : inscripcion.equipo.jugadores;
    const jugadorIds = baseJugadores.map((r) => r.usuarioId);

    const estadisticasPorJugador = await this.getEstadisticasJugadoresTorneo(
      torneoId,
      equipoId,
      jugadorIds,
    );

    return {
      id: inscripcion.equipo.id,
      nombre: inscripcion.equipo.nombre,
      escudo: inscripcion.equipo.escudo,
      telefonoCapitan: inscripcion.equipo.telefonoCapitan,
      cantidadJugadores: baseJugadores.length,
      capitanId: inscripcion.equipo.capitanId,
      jugadores: baseJugadores.map((r) => ({
        id: r.id,
        usuarioId: r.usuarioId,
        equipoId,
        createdAt: r.createdAt,
        usuario: {
          ...r.usuario,
          estadisticas: estadisticasPorJugador.get(r.usuarioId) ?? {
            goles: 0,
            asistencias: 0,
            tarjetasAmarillas: 0,
            tarjetasRojas: 0,
          },
        },
      })),
      invitaciones: [],
      inviteLink: null,
    };
  }

  // ─── Vistas en contexto de torneo ──────────────────────────────────────────

  async findAllByTournament(torneoId: string) {
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { torneoId, estado: 'APROBADA' },
      include: {
        equipo: {
          include: {
            jugadores: {
              include: {
                usuario: {
                  select: { id: true, nombre: true, fotoPerfil: true },
                },
              },
            },
          },
        },
        roster: {
          include: {
            usuario: {
              select: { id: true, nombre: true, fotoPerfil: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return inscripciones.map((ins) => {
      const rosterJugadores = ins.roster.length > 0 
        ? ins.roster.map((r) => ({
            id: r.usuario.id,
            nombre: r.usuario.nombre,
            fotoPerfil: r.usuario.fotoPerfil,
          }))
        : ins.equipo.jugadores.map((j) => ({
            id: j.usuario.id,
            nombre: j.usuario.nombre,
            fotoPerfil: j.usuario.fotoPerfil,
          }));

      return {
        id: ins.equipo.id,
        nombre: ins.equipo.nombre,
        escudo: ins.equipo.escudo,
        telefonoCapitan: ins.equipo.telefonoCapitan,
        cantidadJugadores: rosterJugadores.length,
        jugadores: rosterJugadores,
        createdAt: ins.equipo.createdAt,
      };
    });
  }

  async getMyTeam(torneoId: string, userId: string) {
    const inscripcion = await this.prisma.inscripcion.findFirst({
      where: {
        torneoId,
        estado: { in: ['PENDIENTE', 'APROBADA'] },
        roster: { some: { usuarioId: userId } },
      },
      include: {
        equipo: true,
        roster: {
          include: {
            usuario: {
              select: { id: true, nombre: true, fotoPerfil: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!inscripcion) throw new NotFoundException('No tienes un equipo en este torneo');

    const jugadorIds = inscripcion.roster.map((r) => r.usuarioId);
    const estadisticasPorJugador = await this.getEstadisticasJugadoresTorneo(
      torneoId,
      inscripcion.equipoId,
      jugadorIds,
    );

    return {
      id: inscripcion.equipo.id,
      nombre: inscripcion.equipo.nombre,
      escudo: inscripcion.equipo.escudo,
      telefonoCapitan: inscripcion.equipo.telefonoCapitan,
      cantidadJugadores: inscripcion.roster.length,
      capitanId: inscripcion.equipo.capitanId,
      jugadores: inscripcion.roster.map((r) => ({
        id: r.id,
        usuarioId: r.usuarioId,
        equipoId: inscripcion.equipoId,
        createdAt: r.createdAt,
        usuario: {
          ...r.usuario,
          estadisticas: estadisticasPorJugador.get(r.usuarioId) ?? {
            goles: 0,
            asistencias: 0,
            tarjetasAmarillas: 0,
            tarjetasRojas: 0,
          },
        },
      })),
      invitaciones: [],
      inviteLink: null,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async requireCapitan(equipoId: string, userId: string) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id: equipoId } });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');
    if (equipo.capitanId !== userId) {
      throw new ForbiddenException('Solo el capitán puede realizar esta acción');
    }
    return equipo;
  }

  private async getEstadisticasJugadoresTorneo(
    torneoId: string,
    equipoId: string,
    jugadorIds: string[],
  ) {
    const vacias = () => ({
      goles: 0,
      asistencias: 0,
      tarjetasAmarillas: 0,
      tarjetasRojas: 0,
    });

    const mapa = new Map(jugadorIds.map((id) => [id, vacias()] as const));
    if (jugadorIds.length === 0) return mapa;

    const eventos = await this.prisma.eventoPartido.findMany({
      where: {
        jugadorId: { in: jugadorIds },
        tipo: {
          in: [
            TipoEvento.GOL,
            TipoEvento.ASISTENCIA,
            TipoEvento.TARJETA_AMARILLA,
            TipoEvento.TARJETA_ROJA,
          ],
        },
        OR: [
          { partido: { torneoId, equipoLocalId: equipoId } },
          { partido: { torneoId, equipoVisitanteId: equipoId } },
        ],
      },
      select: { jugadorId: true, tipo: true },
    });

    for (const evento of eventos) {
      if (!evento.jugadorId) continue;
      const stats = mapa.get(evento.jugadorId);
      if (!stats) continue;
      switch (evento.tipo) {
        case TipoEvento.GOL:
          stats.goles += 1;
          break;
        case TipoEvento.ASISTENCIA:
          stats.asistencias += 1;
          break;
        case TipoEvento.TARJETA_AMARILLA:
          stats.tarjetasAmarillas += 1;
          break;
        case TipoEvento.TARJETA_ROJA:
          stats.tarjetasRojas += 1;
          break;
      }
    }

    return mapa;
  }
}
