import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { EstadoTorneo, RolTorneo, TipoInvitacion, EstadoInvitacion } from '@prisma/client';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);
  private readonly resend: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
  ) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  async uploadImage(file: Express.Multer.File) {
    const result = await this.cloudinaryService.uploadStream(
      file.buffer,
      'tournaments',
    );
    return { url: result.secure_url };
  }

  async create(userId: string, dto: CreateTournamentDto) {
    const torneo = await this.prisma.torneo.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        formato: dto.formato,
        modalidad: dto.modalidad,
        maxEquipos: dto.maxEquipos,
        maxJugadoresPorEquipo: dto.maxJugadoresPorEquipo,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        zona: dto.zona,
        imagen: dto.imagen,
        estado: EstadoTorneo.BORRADOR,
        campos: dto.campos
          ? {
              create: dto.campos.map((c) => ({
                nombre: c.nombre,
                direccion: c.direccion,
              })),
            }
          : undefined,
        participantes: {
          create: {
            usuarioId: userId,
            rol: RolTorneo.ORGANIZADOR,
          },
        },
      },
      include: {
        campos: true,
        participantes: { select: { rol: true, usuarioId: true } },
      },
    });

    this.logger.log(`Torneo creado: ${torneo.id} por usuario: ${userId}`);
    return torneo;
  }

  async addStaffPendiente(torneoId: string, userId: string, email: string) {
    await this.checkOrganizador(torneoId, userId);

    const torneo = await this.prisma.torneo.findUnique({ where: { id: torneoId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    if (
      torneo.estado !== EstadoTorneo.BORRADOR &&
      torneo.estado !== EstadoTorneo.EN_INSCRIPCION
    ) {
      throw new BadRequestException(
        'Solo se puede agregar staff a torneos en borrador o inscripción',
      );
    }

    const invitado = await this.prisma.usuario.findUnique({ where: { email } });
    if (!invitado) throw new NotFoundException('No se encontró un usuario con ese correo');

    await this.prisma.invitacionPendiente.upsert({
      where: { torneoId_email_tipo: { torneoId, email, tipo: TipoInvitacion.STAFF } },
      update: {},
      create: {
        torneoId,
        email,
        tipo: TipoInvitacion.STAFF,
        estado: EstadoInvitacion.PENDIENTE,
        invitadoPor: userId,
        usuarioId: invitado.id,
      },
    });

    return { mensaje: 'Staff guardado correctamente' };
  }

  async getStaff(torneoId: string, userId: string) {
    await this.checkOrganizador(torneoId, userId);
    const torneo = await this.prisma.torneo.findUnique({ where: { id: torneoId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    const invitaciones = await this.prisma.invitacionPendiente.findMany({
      where: { torneoId, tipo: TipoInvitacion.STAFF, estado: EstadoInvitacion.PENDIENTE },
      orderBy: { createdAt: 'asc' },
    });

    const aceptados = await this.prisma.usuarioTorneo.findMany({
      where: { torneoId, rol: RolTorneo.STAFF },
      include: {
        usuario: { select: { id: true, nombre: true, email: true, fotoPerfil: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      pendientes: invitaciones.map((i) => ({
        id: i.id,
        email: i.email,
        estado: 'PENDIENTE' as const,
      })),
      aceptados: aceptados.map((s) => ({
        id: s.id,
        nombre: s.usuario.nombre,
        email: s.usuario.email,
        fotoPerfil: s.usuario.fotoPerfil,
        estado: 'ACEPTADO' as const,
      })),
    };
  }

  async getInscripciones(torneoId: string, userId: string) {
    await this.checkOrganizador(torneoId, userId);

    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { torneoId, estado: 'PENDIENTE' },
      include: {
        equipo: {
          include: {
            jugadores: {
              include: {
                usuario: { select: { id: true, nombre: true, fotoPerfil: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return inscripciones.map((i) => ({
      id: i.id,
      estado: i.estado,
      createdAt: i.createdAt,
      equipo: {
        id: i.equipo.id,
        nombre: i.equipo.nombre,
        escudo: i.equipo.escudo,
        telefonoCapitan: i.equipo.telefonoCapitan,
        cantidadJugadores: i.equipo.cantidadJugadores ?? i.equipo.jugadores.length,
        jugadores: i.equipo.jugadores.map((j) => ({
          id: j.usuario.id,
          nombre: j.usuario.nombre,
          email: j.usuario.email,
          fotoPerfil: j.usuario.fotoPerfil,
        })),
      },
    }));
  }

  async responderInscripcion(
    torneoId: string,
    inscripcionId: string,
    userId: string,
    accion: 'aprobar' | 'rechazar',
  ) {
    await this.checkOrganizador(torneoId, userId);

    const inscripcion = await this.prisma.inscripcion.findUnique({
      where: { id: inscripcionId },
    });
    if (inscripcion?.torneoId !== torneoId)
      throw new NotFoundException('Solicitud no encontrada');
    if (inscripcion.estado !== 'PENDIENTE')
      throw new BadRequestException('Esta solicitud ya fue respondida');

    await this.prisma.inscripcion.update({
      where: { id: inscripcionId },
      data: { estado: accion === 'aprobar' ? 'APROBADA' : 'RECHAZADA' },
    });

    return { mensaje: accion === 'aprobar' ? 'Equipo aprobado' : 'Equipo rechazado' };
  }

  async findAll(query: QueryTournamentDto) {
    const torneos = await this.prisma.torneo.findMany({
      where: {
        estado: { in: [EstadoTorneo.EN_INSCRIPCION, EstadoTorneo.EN_CURSO] },
        ...(query.nombre && {
          nombre: { contains: query.nombre, mode: 'insensitive' },
        }),
        ...(query.zona && {
          zona: { contains: query.zona, mode: 'insensitive' },
        }),
      },
      include: {
        campos: true,
        _count: { select: { equipos: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return torneos.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      formato: t.formato,
      modalidad: t.modalidad,
      maxJugadoresPorEquipo: t.maxJugadoresPorEquipo,
      estado: t.estado,
      maxEquipos: t.maxEquipos,
      equiposInscritos: t._count.equipos,
      fechaInicio: t.fechaInicio,
      fechaFin: t.fechaFin,
      zona: t.zona,
      imagen: t.imagen,
      campos: t.campos,
    }));
  }

  async findMy(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });

    // Torneos donde tiene rol confirmado
    const participaciones = await this.prisma.usuarioTorneo.findMany({
      where: { usuarioId: userId },
      include: {
        torneo: {
          include: { campos: true, _count: { select: { equipos: true } } },
        },
      },
    });

    // Torneos con invitación STAFF pendiente (aún no confirmados, ej. BORRADOR)
    const invitacionesPendientes = usuario
      ? await this.prisma.invitacionPendiente.findMany({
          where: {
            email: usuario.email,
            tipo: TipoInvitacion.STAFF,
            estado: EstadoInvitacion.PENDIENTE,
          },
          include: {
            torneo: {
              include: { campos: true, _count: { select: { equipos: true } } },
            },
          },
        })
      : [];

    const confirmadosIds = new Set(participaciones.map((p) => p.torneo.id));

    const confirmados = participaciones.map((p) => ({
      id: p.torneo.id,
      nombre: p.torneo.nombre,
      formato: p.torneo.formato,
      modalidad: p.torneo.modalidad,
      maxJugadoresPorEquipo: p.torneo.maxJugadoresPorEquipo,
      estado: p.torneo.estado,
      maxEquipos: p.torneo.maxEquipos,
      equiposInscritos: p.torneo._count.equipos,
      fechaInicio: p.torneo.fechaInicio,
      fechaFin: p.torneo.fechaFin,
      zona: p.torneo.zona,
      imagen: p.torneo.imagen,
      rolUsuario: p.rol,
      campos: p.torneo.campos,
    }));

    const pendientesStaff = invitacionesPendientes
      .filter((i) => !confirmadosIds.has(i.torneo.id))
      .map((i) => ({
        id: i.torneo.id,
        nombre: i.torneo.nombre,
        formato: i.torneo.formato,
        modalidad: i.torneo.modalidad,
        maxJugadoresPorEquipo: i.torneo.maxJugadoresPorEquipo,
        estado: i.torneo.estado,
        maxEquipos: i.torneo.maxEquipos,
        equiposInscritos: i.torneo._count.equipos,
        fechaInicio: i.torneo.fechaInicio,
        fechaFin: i.torneo.fechaFin,
        zona: i.torneo.zona,
        imagen: i.torneo.imagen,
        rolUsuario: RolTorneo.STAFF,
        campos: i.torneo.campos,
      }));

    const orden: Record<string, number> = {
      EN_CURSO: 0, EN_INSCRIPCION: 1, BORRADOR: 2, FINALIZADO: 3,
    };

    return [...confirmados, ...pendientesStaff].sort(
      (a, b) => (orden[a.estado] ?? 4) - (orden[b.estado] ?? 4),
    );
  }

  async findOne(id: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      include: {
        campos: true,
        participantes: {
          include: {
            usuario: {
              select: { id: true, nombre: true, email: true, fotoPerfil: true },
            },
          },
        },
        equipos: {
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
        _count: { select: { equipos: true, partidos: true } },
      },
    });

    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    const participacion = torneo.participantes.find(
      (p) => p.usuarioId === userId,
    );
    const rolUsuario = participacion?.rol ?? null;

    const [inscripcionPendiente, equiposAprobados] = await Promise.all([
      rolUsuario
        ? Promise.resolve(null)
        : this.prisma.inscripcion.findFirst({
            where: {
              torneoId: id,
              estado: 'PENDIENTE',
              equipo: { jugadores: { some: { usuarioId: userId } } },
            },
            select: { id: true },
          }),
      this.prisma.inscripcion.count({ where: { torneoId: id, estado: 'APROBADA' } }),
    ]);

    return {
      id: torneo.id,
      nombre: torneo.nombre,
      descripcion: torneo.descripcion,
      formato: torneo.formato,
      modalidad: torneo.modalidad,
      maxJugadoresPorEquipo: torneo.maxJugadoresPorEquipo,
      estado: torneo.estado,
      maxEquipos: torneo.maxEquipos,
      equiposInscritos: torneo._count.equipos,
      equiposAprobados,
      totalPartidos: torneo._count.partidos,
      fechaInicio: torneo.fechaInicio,
      fechaFin: torneo.fechaFin,
      zona: torneo.zona,
      imagen: torneo.imagen,
      campos: torneo.campos,
      equipos: torneo.equipos,
      rolUsuario,
      tieneSolicitudPendiente: !!inscripcionPendiente,
      createdAt: torneo.createdAt,
    };
  }

  async update(id: string, userId: string, dto: UpdateTournamentDto) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(id, userId);

    if (
      torneo.estado === EstadoTorneo.EN_CURSO ||
      torneo.estado === EstadoTorneo.FINALIZADO
    ) {
      throw new ForbiddenException(
        'No se puede editar un torneo en curso o finalizado',
      );
    }

    const updated = await this.prisma.torneo.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        formato: dto.formato,
        modalidad: dto.modalidad,
        maxEquipos: dto.maxEquipos,
        maxJugadoresPorEquipo: dto.maxJugadoresPorEquipo,
        fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : undefined,
        zona: dto.zona,
        imagen: dto.imagen,
      },
      include: { campos: true },
    });

    if (dto.imagen && torneo.imagen && dto.imagen !== torneo.imagen) {
      this.cloudinaryService.deleteByUrl(torneo.imagen).catch((err) => {
        this.logger.error(`Error deleting old image: ${err.message}`);
      });
    }

    this.logger.log(`Torneo actualizado: ${id}`);
    return updated;
  }

  async publish(id: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      include: {
        invitaciones: {
          where: { tipo: TipoInvitacion.STAFF, estado: EstadoInvitacion.PENDIENTE },
          include: { usuario: true },
        },
      },
    });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(id, userId);

    if (torneo.estado !== EstadoTorneo.BORRADOR) {
      throw new BadRequestException(
        'Solo se puede publicar un torneo en estado BORRADOR',
      );
    }

    const updated = await this.prisma.torneo.update({
      where: { id },
      data: { estado: EstadoTorneo.EN_INSCRIPCION },
    });

    for (const invitacion of torneo.invitaciones) {
      const usuario = invitacion.usuario;

      if (usuario) {
        await this.prisma.usuarioTorneo.upsert({
          where: { usuarioId_torneoId: { usuarioId: usuario.id, torneoId: id } },
          update: { rol: RolTorneo.STAFF },
          create: { usuarioId: usuario.id, torneoId: id, rol: RolTorneo.STAFF },
        });

        await this.prisma.invitacionPendiente.update({
          where: { id: invitacion.id },
          data: { estado: EstadoInvitacion.ACEPTADA },
        });

        try {
          await this.resend.emails.send({
            from: this.configService.get<string>('RESEND_FROM')!,
            to: invitacion.email,
            subject: `Eres Staff en ${torneo.nombre} - TourneyFC`,
            html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #0D7A3E;">TourneyFC</h2>
            <p>Hola <strong>${usuario.nombre}</strong>,</p>
            <p>Has sido asignado como <strong>Staff</strong> en el siguiente torneo:</p>
            <div style="background: #EBF0EC; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #0F1A14;">${torneo.nombre}</p>
            </div>
            <p style="color: #3D4F44; font-size: 14px;">Ingresa a TourneyFC para ver los detalles del torneo.</p>
          </div>
        `,
          });
          this.logger.log(`Correo de staff enviado a: ${invitacion.email} para torneo: ${id}`);
        } catch (error: any) {
          this.logger.error(`Error al enviar correo a ${invitacion.email}: ${error.message}`);
        }
      }
    }

    this.logger.log(`Torneo publicado: ${id}`);
    return updated;
  }

  async startTournament(id: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      include: { _count: { select: { partidos: true } } },
    });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(id, userId);

    if (torneo.estado !== EstadoTorneo.EN_INSCRIPCION) {
      throw new BadRequestException(
        'Solo se puede iniciar un torneo en estado EN_INSCRIPCION',
      );
    }

    if (torneo._count.partidos === 0) {
      throw new BadRequestException(
        'Debes generar el fixture antes de iniciar el torneo',
      );
    }

    const equiposAprobados = await this.prisma.inscripcion.count({
      where: { torneoId: id, estado: 'APROBADA' },
    });
    if (equiposAprobados < torneo.maxEquipos) {
      throw new BadRequestException(
        `Faltan equipos aprobados: hay ${equiposAprobados} de ${torneo.maxEquipos} requeridos.`,
      );
    }

    const updated = await this.prisma.torneo.update({
      where: { id },
      data: { estado: EstadoTorneo.EN_CURSO },
    });

    this.logger.log(`Torneo iniciado: ${id}`);
    return updated;
  }

  async remove(id: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(id, userId);

    if (torneo.estado === EstadoTorneo.EN_CURSO) {
      throw new ForbiddenException('No se puede eliminar un torneo en curso');
    }

    await this.prisma.torneo.delete({ where: { id } });
    this.logger.log(`Torneo eliminado: ${id}`);

    return { mensaje: 'Torneo eliminado exitosamente' };
  }

  private async checkOrganizador(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });

    if (!participacion || participacion.rol !== RolTorneo.ORGANIZADOR) {
      throw new ForbiddenException(
        'Solo el organizador puede realizar esta acción',
      );
    }
  }

  async getCampos(torneoId: string) {
    return this.prisma.campoJuego.findMany({
      where: { torneoId },
      select: { id: true, nombre: true, direccion: true },
      orderBy: { nombre: 'asc' },
    });
  }
}
