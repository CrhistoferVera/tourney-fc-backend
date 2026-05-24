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
import {
  RolTorneo,
  TipoInvitacion,
  EstadoInvitacion,
  TipoEvento,
} from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async uploadEscudo(file: Express.Multer.File) {
    const result = await this.cloudinaryService.uploadStream(file.buffer, 'escudos');
    return { url: result.secure_url };
  }

  async create(torneoId: string, userId: string, dto: CreateTeamDto) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
    });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    if (torneo.estado !== 'EN_INSCRIPCION') {
      throw new BadRequestException(
        'Solo se pueden inscribir equipos cuando el torneo está en período de inscripción',
      );
    }

    // Verificar si el usuario ya tiene equipo en este torneo
    const inscripcionActiva = await this.prisma.inscripcion.findFirst({
      where: {
        torneoId,
        estado: { in: ['PENDIENTE', 'APROBADA'] },
        equipo: {
          jugadores: { some: { usuarioId: userId } },
        },
      },
    });
    if (inscripcionActiva) {
      throw new BadRequestException(
        'Ya tienes una solicitud activa en este torneo',
      );
    }

    // Verificar cupo
    const totalAprobados = await this.prisma.inscripcion.count({
      where: { torneoId, estado: 'APROBADA' },
    });
    if (totalAprobados >= torneo.maxEquipos) {
      throw new BadRequestException(
        'El torneo ya alcanzó el cupo máximo de equipos',
      );
    }

    const equipo = await this.prisma.equipo.create({
      data: {
        torneoId,
        nombre: dto.nombre,
        escudo: dto.escudo,
        telefonoCapitan: dto.telefonoCapitan,
        cantidadJugadores: dto.cantidadJugadores,
      },
    });

    await this.prisma.usuarioEquipo.create({
      data: { usuarioId: userId, equipoId: equipo.id },
    });

    const participacionExistente = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });

    if (!participacionExistente) {
      await this.prisma.usuarioTorneo.create({
        data: { usuarioId: userId, torneoId, rol: RolTorneo.CAPITAN },
      });
    } else if (
      participacionExistente.rol !== RolTorneo.ORGANIZADOR &&
      participacionExistente.rol !== RolTorneo.STAFF
    ) {
      await this.prisma.usuarioTorneo.update({
        where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
        data: { rol: RolTorneo.CAPITAN },
      });
    }

    this.logger.log(
      `Equipo creado: ${equipo.id} en torneo: ${torneoId} por usuario: ${userId}`,
    );

    await this.prisma.inscripcion.create({
      data: {
        torneoId,
        equipoId: equipo.id,
        estado: 'PENDIENTE',
      },
    });
    return equipo;
  }

  async remove(equipoId: string, userId: string) {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id: equipoId },
      include: { jugadores: true },
    });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    const torneo = await this.prisma.torneo.findUnique({
      where: { id: equipo.torneoId },
    });
    if (torneo?.estado === 'EN_CURSO' || torneo?.estado === 'FINALIZADO') {
      throw new ForbiddenException(
        'No se pueden eliminar equipos cuando el torneo está en curso o finalizado',
      );
    }

    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: {
        usuarioId_torneoId: { usuarioId: userId, torneoId: equipo.torneoId },
      },
    });

    const esCapitanDelEquipo =
      participacion?.rol === RolTorneo.CAPITAN &&
      equipo.jugadores.some((j) => j.usuarioId === userId);

    const esOrganizadorOStaff =
      participacion?.rol === RolTorneo.ORGANIZADOR ||
      participacion?.rol === RolTorneo.STAFF;

    if (!esCapitanDelEquipo && !esOrganizadorOStaff) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este equipo',
      );
    }
    const jugadoresIds = equipo.jugadores.map((j) => j.usuarioId);
    await this.prisma.usuarioTorneo.deleteMany({
      where: {
        torneoId: equipo.torneoId,
        usuarioId: { in: jugadoresIds },
        rol: RolTorneo.CAPITAN,
      },
    });
    await this.prisma.usuarioEquipo.deleteMany({ where: { equipoId } });
    await this.prisma.inscripcion.deleteMany({ where: { equipoId } });
    await this.prisma.equipo.delete({ where: { id: equipoId } });
    this.logger.log(`Equipo eliminado: ${equipoId}`);
    return { mensaje: 'Equipo eliminado exitosamente' };
  }

  // Listar equipos de un torneo
  async findAll(torneoId: string) {
    const equipos = await this.prisma.equipo.findMany({
      where: { torneoId, inscripcion: { estado: 'APROBADA' } },
      include: {
        jugadores: {
          include: {
            usuario: {
              select: { id: true, nombre: true, fotoPerfil: true },
            },
          },
        },
        _count: { select: { jugadores: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return equipos.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      escudo: e.escudo,
      telefonoCapitan: e.telefonoCapitan,
      cantidadJugadores: e.cantidadJugadores ?? e._count.jugadores,
      jugadores: e.jugadores.map((j) => ({
        id: j.usuario.id,
        nombre: j.usuario.nombre,
        fotoPerfil: j.usuario.fotoPerfil,
      })),
      createdAt: e.createdAt,
    }));
  }

  // Detalle de un equipo
  async findOne(equipoId: string) {
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
        torneo: { select: { id: true, nombre: true } },
      },
    });

    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    const jugadorIds = equipo.jugadores.map((j) => j.usuarioId);
    const capitan = await this.prisma.usuarioTorneo.findFirst({
      where: {
        torneoId: equipo.torneoId,
        usuarioId: { in: jugadorIds },
        rol: RolTorneo.CAPITAN,
      },
      select: { usuarioId: true },
    });

    const estadisticasPorJugador = await this.getEstadisticasJugadoresTorneo(
      equipo.torneoId,
      equipoId,
      jugadorIds,
    );

    return {
      id: equipo.id,
      nombre: equipo.nombre,
      escudo: equipo.escudo,
      telefonoCapitan: equipo.telefonoCapitan,
      cantidadJugadores: equipo.cantidadJugadores ?? equipo.jugadores.length,
      jugadores: equipo.jugadores.map((j) => ({
        id: j.usuario.id,
        nombre: j.usuario.nombre,
        fotoPerfil: j.usuario.fotoPerfil,
        email: j.usuario.email,
        estadisticas: estadisticasPorJugador.get(j.usuario.id) ?? {
          goles: 0,
          asistencias: 0,
          tarjetasAmarillas: 0,
          tarjetasRojas: 0,
        },
      })),
      createdAt: equipo.createdAt,
      torneo: equipo.torneo,
      capitanId: capitan?.usuarioId ?? null,
    };
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

    const mapa = new Map(
      jugadorIds.map((id) => [id, vacias()] as const),
    );

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
        partido: {
          torneoId,
          OR: [{ equipoLocalId: equipoId }, { equipoVisitanteId: equipoId }],
        },
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

  // Editar equipo — solo CAPITAN u ORGANIZADOR/STAFF
  async update(equipoId: string, userId: string, dto: UpdateTeamDto) {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id: equipoId },
    });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    await this.checkCapitanOSuperior(equipo.torneoId, userId);

    const updated = await this.prisma.equipo.update({
      where: { id: equipoId },
      data: dto,
    });

    this.logger.log(`Equipo actualizado: ${equipoId}`);
    return updated;
  }

  // Agregar jugador al equipo mediante enlace — HU-17
  async joinTeam(equipoId: string, userId: string) {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id: equipoId },
      include: { torneo: true },
    });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    const yaEsMiembro = await this.prisma.usuarioEquipo.findUnique({
      where: { usuarioId_equipoId: { usuarioId: userId, equipoId } },
    });
    if (yaEsMiembro)
      throw new ForbiddenException('Ya eres miembro de este equipo');

    await this.prisma.usuarioEquipo.create({
      data: { usuarioId: userId, equipoId },
    });

    // Asignar rol JUGADOR en el torneo si no tiene rol
    await this.prisma.usuarioTorneo.upsert({
      where: {
        usuarioId_torneoId: { usuarioId: userId, torneoId: equipo.torneoId },
      },
      update: {},
      create: {
        usuarioId: userId,
        torneoId: equipo.torneoId,
        rol: RolTorneo.JUGADOR,
      },
    });

    this.logger.log(`Usuario ${userId} se unió al equipo ${equipoId}`);
    return { mensaje: 'Te has unido al equipo exitosamente' };
  }

  // Helpers de rol
  private async checkCapitanOSuperior(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    const rolesPermitidos: RolTorneo[] = [
      RolTorneo.CAPITAN,
      RolTorneo.ORGANIZADOR,
      RolTorneo.STAFF,
    ];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }
  }

  private async checkOrganizadorOStaff(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    const rolesPermitidos: RolTorneo[] = [
      RolTorneo.ORGANIZADOR,
      RolTorneo.STAFF,
    ];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException(
        'Solo el organizador o staff puede realizar esta acción',
      );
    }
  }

  async getMyTeam(torneoId: string, userId: string) {
    // Step 1: find all teams in this tournament the user belongs to
    const memberships = await this.prisma.usuarioEquipo.findMany({
      where: { usuarioId: userId, equipo: { torneoId } },
      select: { equipoId: true },
    });

    if (memberships.length === 0) {
      throw new NotFoundException('No tienes un equipo en este torneo');
    }

    const equipoId = memberships[0].equipoId;

    const equipo = await this.prisma.equipo.findUnique({
      where: { id: equipoId },
      include: {
        jugadores: {
          include: {
            usuario: { select: { id: true, nombre: true, fotoPerfil: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        invitaciones: {
          where: { tipo: TipoInvitacion.JUGADOR, estado: EstadoInvitacion.PENDIENTE },
          select: { id: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!equipo) throw new NotFoundException('No tienes un equipo en este torneo');

    // Find the captain: a team member who holds the CAPITAN role in this tournament
    const jugadorIds = equipo.jugadores.map((j) => j.usuarioId);
    const capitan = await this.prisma.usuarioTorneo.findFirst({
      where: { torneoId, usuarioId: { in: jugadorIds }, rol: RolTorneo.CAPITAN },
      select: { usuarioId: true },
    });

    const estadisticasPorJugador = await this.getEstadisticasJugadoresTorneo(
      torneoId,
      equipoId,
      jugadorIds,
    );

    return {
      ...equipo,
      capitanId: capitan?.usuarioId ?? null,
      jugadores: equipo.jugadores.map((j) => ({
        ...j,
        usuario: {
          ...j.usuario,
          estadisticas: estadisticasPorJugador.get(j.usuarioId) ?? {
            goles: 0,
            asistencias: 0,
            tarjetasAmarillas: 0,
            tarjetasRojas: 0,
          },
        },
      })),
    };
  }

  async invitePlayer(teamId: string, userId: string, email: string) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id: teamId } });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    // Caller must be CAPITAN of this tournament
    const esCapitan = await this.prisma.usuarioTorneo.findFirst({
      where: { usuarioId: userId, torneoId: equipo.torneoId, rol: RolTorneo.CAPITAN },
    });
    if (!esCapitan) throw new ForbiddenException('Solo el capitán puede invitar jugadores');

    // Caller must belong to this specific team
    const esDeEquipo = await this.prisma.usuarioEquipo.findUnique({
      where: { usuarioId_equipoId: { usuarioId: userId, equipoId: teamId } },
    });
    if (!esDeEquipo) throw new ForbiddenException('No eres miembro de este equipo');

    const invitado = await this.prisma.usuario.findUnique({ where: { email } });
    if (!invitado) throw new NotFoundException('No se encontró un usuario con ese correo');
    if (invitado.id === userId) throw new BadRequestException('No puedes invitarte a ti mismo');

    const yaEnEquipo = await this.prisma.usuarioEquipo.findUnique({
      where: { usuarioId_equipoId: { usuarioId: invitado.id, equipoId: teamId } },
    });
    if (yaEnEquipo) throw new BadRequestException('Este usuario ya es miembro de tu equipo');

    const yaEnTorneo = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: invitado.id, torneoId: equipo.torneoId } },
    });
    if (yaEnTorneo) throw new BadRequestException('Este usuario ya participa en este torneo');

    await this.prisma.invitacionPendiente.upsert({
      where: { torneoId_email_tipo: { torneoId: equipo.torneoId, email, tipo: TipoInvitacion.JUGADOR } },
      update: { equipoId: teamId, estado: EstadoInvitacion.PENDIENTE, invitadoPor: userId },
      create: {
        torneoId: equipo.torneoId,
        equipoId: teamId,
        email,
        tipo: TipoInvitacion.JUGADOR,
        estado: EstadoInvitacion.PENDIENTE,
        invitadoPor: userId,
        usuarioId: invitado.id,
      },
    });

    this.logger.log(`Capitán ${userId} invitó a ${email} al equipo ${teamId}`);
    return { mensaje: 'Jugador invitado correctamente' };
  }
}
