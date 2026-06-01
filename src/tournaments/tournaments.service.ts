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
import { EstadoTorneo, RolTorneo, TipoInvitacion, EstadoInvitacion, TipoEvento, EstadoPartido, FaseJuego, FormatoTorneo } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MatchesService } from '../matches/matches.service';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);
  private readonly mailer: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly matchesService: MatchesService,
  ) {
    this.mailer = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST'),
      port: this.configService.get<number>('EMAIL_PORT'),
      secure: false,
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      },
    });
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
                latitud: c.latitud,
                longitud: c.longitud,
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

    const existente = await this.prisma.invitacionPendiente.findFirst({
      where: { torneoId, email, tipo: TipoInvitacion.STAFF },
    });
    if (!existente) {
      await this.prisma.invitacionPendiente.create({
        data: {
          torneoId,
          email,
          tipo: TipoInvitacion.STAFF,
          estado: EstadoInvitacion.PENDIENTE,
          invitadoPor: userId,
          usuarioId: invitado.id,
        },
      });
    }

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
      include: { equipo: true, roster: true },
    });
    if (inscripcion?.torneoId !== torneoId)
      throw new NotFoundException('Solicitud no encontrada');
    if (inscripcion.estado !== 'PENDIENTE')
      throw new BadRequestException('Esta solicitud ya fue respondida');

    await this.prisma.inscripcion.update({
      where: { id: inscripcionId },
      data: { estado: accion === 'aprobar' ? 'APROBADA' : 'RECHAZADA' },
    });

    if (accion === 'aprobar') {
      for (const r of inscripcion.roster) {
        const rol =
          r.usuarioId === inscripcion.equipo.capitanId
            ? RolTorneo.CAPITAN
            : RolTorneo.JUGADOR;
        await this.prisma.usuarioTorneo.upsert({
          where: { usuarioId_torneoId: { usuarioId: r.usuarioId, torneoId } },
          update: { rol },
          create: { usuarioId: r.usuarioId, torneoId, rol },
        });
      }
    }

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
        _count: { select: { inscripciones: { where: { estado: 'APROBADA' } } } },
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
      equiposInscritos: t._count.inscripciones,
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
          include: {
            campos: true,
            _count: { select: { inscripciones: { where: { estado: 'APROBADA' } } } },
          },
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
            torneoId: { not: null },
          },
          include: {
            torneo: {
              include: {
                campos: true,
                _count: { select: { inscripciones: { where: { estado: 'APROBADA' } } } },
              },
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
      equiposInscritos: p.torneo._count.inscripciones,
      fechaInicio: p.torneo.fechaInicio,
      fechaFin: p.torneo.fechaFin,
      zona: p.torneo.zona,
      imagen: p.torneo.imagen,
      rolUsuario: p.rol,
      tieneSolicitudPendiente: false,
      campos: p.torneo.campos,
    }));

    // Torneos donde el usuario está en un roster PENDIENTE o APROBADO
    // pero aún no tiene UsuarioTorneo (roles no asignados — fallback)
    const inscripcionesRoster = await this.prisma.inscripcion.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'APROBADA'] },
        roster: { some: { usuarioId: userId } },
        torneoId: { notIn: [...confirmadosIds] },
      },
      include: {
        torneo: {
          include: {
            campos: true,
            _count: { select: { inscripciones: { where: { estado: 'APROBADA' } } } },
          },
        },
        equipo: { select: { capitanId: true } },
      },
    });

    const desdeRoster = inscripcionesRoster.map((ins) => ({
      id: ins.torneo.id,
      nombre: ins.torneo.nombre,
      formato: ins.torneo.formato,
      modalidad: ins.torneo.modalidad,
      maxJugadoresPorEquipo: ins.torneo.maxJugadoresPorEquipo,
      estado: ins.torneo.estado,
      maxEquipos: ins.torneo.maxEquipos,
      equiposInscritos: ins.torneo._count.inscripciones,
      fechaInicio: ins.torneo.fechaInicio,
      fechaFin: ins.torneo.fechaFin,
      zona: ins.torneo.zona,
      imagen: ins.torneo.imagen,
      rolUsuario:
        ins.estado === 'APROBADA'
          ? ins.equipo.capitanId === userId
            ? RolTorneo.CAPITAN
            : RolTorneo.JUGADOR
          : null,
      tieneSolicitudPendiente: ins.estado === 'PENDIENTE',
      campos: ins.torneo.campos,
    }));

    const pendientesStaff = invitacionesPendientes
      .filter((i): i is typeof i & { torneo: NonNullable<typeof i.torneo> } => !!i.torneo)
      .filter((i) => !confirmadosIds.has(i.torneo.id))
      .map((i) => ({
        id: i.torneo.id,
        nombre: i.torneo.nombre,
        formato: i.torneo.formato,
        modalidad: i.torneo.modalidad,
        maxJugadoresPorEquipo: i.torneo.maxJugadoresPorEquipo,
        estado: i.torneo.estado,
        maxEquipos: i.torneo.maxEquipos,
        equiposInscritos: i.torneo._count.inscripciones,
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

    return [...confirmados, ...pendientesStaff, ...desdeRoster].sort(
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
        inscripciones: {
          where: { estado: 'APROBADA' },
          include: {
            equipo: true,
            roster: {
              include: {
                usuario: {
                  select: { id: true, nombre: true, fotoPerfil: true },
                },
              },
            },
          },
        },
        _count: { select: { partidos: true } },
      },
    });

    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    const participacion = torneo.participantes.find(
      (p) => p.usuarioId === userId,
    );
    let rolUsuario: string | null = participacion?.rol ?? null;

    // Fallback: si no hay UsuarioTorneo (roles no asignados), derivar desde el roster
    let tieneSolicitudPendiente = false;
    if (!rolUsuario) {
      const inscripcionDelUsuario = await this.prisma.inscripcion.findFirst({
        where: {
          torneoId: id,
          estado: { in: ['PENDIENTE', 'APROBADA'] },
          roster: { some: { usuarioId: userId } },
        },
        include: { equipo: { select: { capitanId: true } } },
      });
      if (inscripcionDelUsuario) {
        if (inscripcionDelUsuario.estado === 'PENDIENTE') {
          tieneSolicitudPendiente = true;
        } else {
          rolUsuario =
            inscripcionDelUsuario.equipo.capitanId === userId
              ? RolTorneo.CAPITAN
              : RolTorneo.JUGADOR;
        }
      }
    }

    // Mantener variable para compatibilidad con el resto del método
    const inscripcionPendiente = tieneSolicitudPendiente ? { id: 'derived' } : null;

    const equiposAprobados = torneo.inscripciones.length;
    const equipos = torneo.inscripciones.map((ins) => ({
      ...ins.equipo,
      jugadores: ins.roster.map((r) => ({
        usuario: r.usuario,
      })),
    }));

    const ganadorTorneo =
      torneo.estado === EstadoTorneo.FINALIZADO
        ? await this.matchesService.getGanadorTorneo(id)
        : null;

    return {
      id: torneo.id,
      nombre: torneo.nombre,
      descripcion: torneo.descripcion,
      formato: torneo.formato,
      modalidad: torneo.modalidad,
      maxJugadoresPorEquipo: torneo.maxJugadoresPorEquipo,
      estado: torneo.estado,
      maxEquipos: torneo.maxEquipos,
      equiposInscritos: equiposAprobados,
      equiposAprobados,
      totalPartidos: torneo._count.partidos,
      fechaInicio: torneo.fechaInicio,
      fechaFin: torneo.fechaFin,
      zona: torneo.zona,
      imagen: torneo.imagen,
      campos: torneo.campos,
      equipos,
      rolUsuario,
      tieneSolicitudPendiente: !!inscripcionPendiente,
      createdAt: torneo.createdAt,
      ganadorTorneo,
    };
  }

  async update(id: string, userId: string, dto: UpdateTournamentDto) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(id, userId);

    if (torneo.estado === EstadoTorneo.FINALIZADO) {
      throw new ForbiddenException('No se puede editar un torneo finalizado');
    }

    if (torneo.estado === EstadoTorneo.EN_CURSO) {
      const disallowed = (
        ['nombre', 'descripcion', 'formato', 'modalidad', 'maxJugadoresPorEquipo', 'maxEquipos', 'fechaInicio', 'zona', 'imagen'] as const
      ).filter((key) => dto[key] !== undefined);
      if (disallowed.length > 0) {
        throw new ForbiddenException(
          'Con el torneo en curso solo puedes modificar la fecha de fin',
        );
      }

      const data: Record<string, unknown> = {};

      if (dto.fechaFin !== undefined) {
        const fin = new Date(dto.fechaFin);
        const inicio = torneo.fechaInicio ? new Date(torneo.fechaInicio) : null;
        if (inicio) {
          inicio.setHours(0, 0, 0, 0);
          const finDay = new Date(fin);
          finDay.setHours(0, 0, 0, 0);
          if (finDay < inicio) {
            throw new BadRequestException(
              'La fecha de fin no puede ser anterior a la fecha de inicio',
            );
          }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const finDay = new Date(fin);
        finDay.setHours(0, 0, 0, 0);
        if (finDay < today) {
          throw new BadRequestException(
            'La fecha de fin no puede ser anterior a la fecha actual',
          );
        }

        const ultimoPartido = await this.prisma.partido.findFirst({
          where: { torneoId: id, fecha: { not: null } },
          orderBy: { fecha: 'desc' },
          select: { fecha: true },
        });
        if (ultimoPartido?.fecha) {
          const ultima = new Date(ultimoPartido.fecha);
          ultima.setHours(0, 0, 0, 0);
          if (finDay < ultima) {
            throw new BadRequestException(
              'La fecha de fin no puede ser anterior a la de un partido ya programado',
            );
          }
        }

        data.fechaFin = fin;
      }

      if (Object.keys(data).length === 0) {
        throw new BadRequestException('No hay cambios para guardar');
      }

      const updated = await this.prisma.torneo.update({
        where: { id },
        data,
        include: { campos: true },
      });

      this.logger.log(`Torneo en curso actualizado: ${id}`);
      return updated;
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
          await this.mailer.sendMail({
            from: this.configService.get<string>('EMAIL_FROM'),
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

  async addCampo(
    torneoId: string,
    userId: string,
    dto: { nombre: string; direccion?: string; latitud?: number; longitud?: number },
  ) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id: torneoId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(torneoId, userId);

    if (!dto.nombre) {
      throw new BadRequestException('El nombre de la cancha es requerido');
    }

    return this.prisma.campoJuego.create({
      data: {
        torneoId,
        nombre: dto.nombre,
        direccion: dto.direccion,
        latitud: dto.latitud,
        longitud: dto.longitud,
      },
    });
  }

  async getCampos(torneoId: string) {
    return this.prisma.campoJuego.findMany({
      where: { torneoId },
      select: { id: true, nombre: true, direccion: true, latitud: true, longitud: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async getEstadisticas(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
      select: { rol: true },
    });
    const rol = participacion?.rol ?? null;
    const wantPersonal = rol === RolTorneo.CAPITAN || rol === RolTorneo.JUGADOR;

    const eventos = await this.prisma.eventoPartido.findMany({
      where: {
        partido: { torneoId },
        tipo: {
          in: [
            TipoEvento.GOL,
            TipoEvento.ASISTENCIA,
            TipoEvento.TARJETA_AMARILLA,
            TipoEvento.TARJETA_ROJA,
            TipoEvento.FALTA,
            TipoEvento.PENAL_FALLADO,
          ],
        },
        jugadorId: { not: null },
      },
      select: {
        jugadorId: true,
        tipo: true,
        jugador: { select: { id: true, nombre: true, fotoPerfil: true } },
        equipo: { select: { nombre: true } },
      },
    });

    type PlayerStats = {
      nombre: string;
      fotoPerfil: string | null;
      equipoNombre: string;
      goles: number;
      asistencias: number;
      amarillas: number;
      rojas: number;
      faltas: number;
      penalesFallados: number;
    };
    const mapa = new Map<string, PlayerStats>();

    for (const ev of eventos) {
      if (!ev.jugadorId || !ev.jugador) continue;
      if (!mapa.has(ev.jugadorId)) {
        mapa.set(ev.jugadorId, {
          nombre: ev.jugador.nombre,
          fotoPerfil: ev.jugador.fotoPerfil,
          equipoNombre: ev.equipo?.nombre ?? '',
          goles: 0,
          asistencias: 0,
          amarillas: 0,
          rojas: 0,
          faltas: 0,
          penalesFallados: 0,
        });
      }
      const s = mapa.get(ev.jugadorId)!;
      switch (ev.tipo) {
        case TipoEvento.GOL:           s.goles++;           break;
        case TipoEvento.ASISTENCIA:    s.asistencias++;     break;
        case TipoEvento.TARJETA_AMARILLA: s.amarillas++;    break;
        case TipoEvento.TARJETA_ROJA:  s.rojas++;           break;
        case TipoEvento.FALTA:         s.faltas++;          break;
        case TipoEvento.PENAL_FALLADO: s.penalesFallados++; break;
      }
    }

    const totalPartidos = await this.prisma.partido.count({
      where: { torneoId, faseJuego: FaseJuego.FINALIZADO },
    });

    const vals = [...mapa.values()];
    const totalGoles          = vals.reduce((a, v) => a + v.goles, 0);
    const totalAmarillas      = vals.reduce((a, v) => a + v.amarillas, 0);
    const totalRojas          = vals.reduce((a, v) => a + v.rojas, 0);
    const totalFaltas         = vals.reduce((a, v) => a + v.faltas, 0);
    const promedioGoles       = totalPartidos === 0 ? 0 : +(totalGoles / totalPartidos).toFixed(2);

    const buildFull = (key: keyof PlayerStats) =>
      [...mapa.entries()]
        .filter(([, v]) => (v[key] as number) > 0)
        .sort((a, b) => (b[1][key] as number) - (a[1][key] as number))
        .map(([jugadorId, v], idx) => ({
          posicion: idx + 1,
          jugadorId,
          nombre: v.nombre,
          fotoPerfil: v.fotoPerfil,
          equipoNombre: v.equipoNombre,
          valor: v[key] as number,
        }));

    const fullGoleadores      = buildFull('goles');
    const fullAsistentes      = buildFull('asistencias');
    const fullAmarillas       = buildFull('amarillas');
    const fullRojas           = buildFull('rojas');
    const fullFaltas          = buildFull('faltas');
    const fullPenalesFallados = buildFull('penalesFallados');

    const rankOf = (full: { jugadorId: string }[], id: string) => {
      const idx = full.findIndex((e) => e.jugadorId === id);
      return idx === -1 ? null : idx + 1;
    };

    type EstPersonales = {
      goles: number; asistencias: number; tarjetasAmarillas: number;
      tarjetasRojas: number; faltas: number; penalesFallados: number;
      posicionGoles: number | null; posicionAsistencias: number | null;
      posicionAmarillas: number | null; posicionRojas: number | null;
      posicionFaltas: number | null; posicionPenalesFallados: number | null;
    };
    let estadisticasPersonales: EstPersonales | null = null;
    if (wantPersonal) {
      const personal = mapa.get(userId);
      if (personal) {
        estadisticasPersonales = {
          goles:              personal.goles,
          asistencias:        personal.asistencias,
          tarjetasAmarillas:  personal.amarillas,
          tarjetasRojas:      personal.rojas,
          faltas:             personal.faltas,
          penalesFallados:    personal.penalesFallados,
          posicionGoles:          personal.goles > 0          ? rankOf(fullGoleadores, userId)      : null,
          posicionAsistencias:    personal.asistencias > 0    ? rankOf(fullAsistentes, userId)      : null,
          posicionAmarillas:      personal.amarillas > 0      ? rankOf(fullAmarillas, userId)       : null,
          posicionRojas:          personal.rojas > 0          ? rankOf(fullRojas, userId)           : null,
          posicionFaltas:         personal.faltas > 0         ? rankOf(fullFaltas, userId)          : null,
          posicionPenalesFallados: personal.penalesFallados > 0 ? rankOf(fullPenalesFallados, userId) : null,
        };
      } else {
        estadisticasPersonales = {
          goles: 0, asistencias: 0, tarjetasAmarillas: 0,
          tarjetasRojas: 0, faltas: 0, penalesFallados: 0,
          posicionGoles: null, posicionAsistencias: null,
          posicionAmarillas: null, posicionRojas: null,
          posicionFaltas: null, posicionPenalesFallados: null,
        };
      }
    }

    return {
      resumen: {
        totalPartidos,
        totalGoles,
        totalTarjetasAmarillas: totalAmarillas,
        totalTarjetasRojas: totalRojas,
        promedioGolesPorPartido: promedioGoles,
        totalFaltas,
      },
      goleadores:      fullGoleadores.slice(0, 10),
      asistentes:      fullAsistentes.slice(0, 10),
      amarillas:       fullAmarillas.slice(0, 10),
      rojas:           fullRojas.slice(0, 10),
      faltas:          fullFaltas.slice(0, 10),
      penalesFallados: fullPenalesFallados.slice(0, 10),
      estadisticasPersonales,
    };
  }
}
