import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,  } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { EstadoTorneo, RolTorneo } from '@prisma/client';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);
  private readonly resend: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  async create(userId: string, dto: CreateTournamentDto) {
    const torneo = await this.prisma.torneo.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        formato: dto.formato,
        maxEquipos: dto.maxEquipos,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        zona: dto.zona,
        estado: EstadoTorneo.BORRADOR,
        campos: dto.campos
          ? { create: dto.campos.map((c) => ({ nombre: c.nombre, direccion: c.direccion })) }
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

    if (torneo.estado !== EstadoTorneo.BORRADOR && torneo.estado !== EstadoTorneo.EN_INSCRIPCION) {
      throw new BadRequestException('Solo se puede agregar staff a torneos en borrador o inscripción');
    }

    await this.prisma.staffPendiente.upsert({
      where: { torneoId_email: { torneoId, email } },
      update: {},
      create: { torneoId, email },
    });

    return { mensaje: 'Staff guardado correctamente' };
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
      estado: t.estado,
      maxEquipos: t.maxEquipos,
      equiposInscritos: t._count.equipos,
      fechaInicio: t.fechaInicio,
      fechaFin: t.fechaFin,
      zona: t.zona,
      campos: t.campos,
    }));
  }

  async findMy(userId: string) {
    const participaciones = await this.prisma.usuarioTorneo.findMany({
      where: { usuarioId: userId },
      include: {
        torneo: {
          include: {
            campos: true,
            _count: { select: { equipos: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return participaciones
      .map((p) => ({
        id: p.torneo.id,
        nombre: p.torneo.nombre,
        formato: p.torneo.formato,
        estado: p.torneo.estado,
        maxEquipos: p.torneo.maxEquipos,
        equiposInscritos: p.torneo._count.equipos,
        fechaInicio: p.torneo.fechaInicio,
        fechaFin: p.torneo.fechaFin,
        zona: p.torneo.zona,
        rol: p.rol,
        campos: p.torneo.campos,
      }))
      .sort((a, b) => {
        const orden: Record<string, number> = {
          EN_CURSO: 0,
          EN_INSCRIPCION: 1,
          BORRADOR: 2,
          FINALIZADO: 3,
        };
        return (orden[a.estado] ?? 4) - (orden[b.estado] ?? 4);
      });
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
                usuario: { select: { id: true, nombre: true, fotoPerfil: true } },
              },
            },
          },
        },
        _count: { select: { equipos: true, partidos: true } },
      },
    });

    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    const participacion = torneo.participantes.find((p) => p.usuarioId === userId);
    const rolUsuario = participacion?.rol ?? null;

    return {
      id: torneo.id,
      nombre: torneo.nombre,
      descripcion: torneo.descripcion,
      formato: torneo.formato,
      estado: torneo.estado,
      maxEquipos: torneo.maxEquipos,
      equiposInscritos: torneo._count.equipos,
      totalPartidos: torneo._count.partidos,
      fechaInicio: torneo.fechaInicio,
      fechaFin: torneo.fechaFin,
      zona: torneo.zona,
      campos: torneo.campos,
      equipos: torneo.equipos,
      rolUsuario,
      createdAt: torneo.createdAt,
    };
  }

  async update(id: string, userId: string, dto: UpdateTournamentDto) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(id, userId);

    if (torneo.estado === EstadoTorneo.EN_CURSO || torneo.estado === EstadoTorneo.FINALIZADO) {
      throw new ForbiddenException('No se puede editar un torneo en curso o finalizado');
    }

    const updated = await this.prisma.torneo.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        formato: dto.formato,
        maxEquipos: dto.maxEquipos,
        fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : undefined,
        zona: dto.zona,
      },
      include: { campos: true },
    });

    this.logger.log(`Torneo actualizado: ${id}`);
    return updated;
  }

  async publish(id: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      include: { staffPendiente: true },
    });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    await this.checkOrganizador(id, userId);

    if (torneo.estado !== EstadoTorneo.BORRADOR) {
      throw new BadRequestException('Solo se puede publicar un torneo en estado BORRADOR');
    }

    const updated = await this.prisma.torneo.update({
      where: { id },
      data: { estado: EstadoTorneo.EN_INSCRIPCION },
    });

    // Procesar staff pendiente
    for (const staff of torneo.staffPendiente) {
      const usuario = await this.prisma.usuario.findUnique({
        where: { email: staff.email },
      });

      if (usuario) {
        // Asignar rol STAFF
        await this.prisma.usuarioTorneo.upsert({
          where: { usuarioId_torneoId: { usuarioId: usuario.id, torneoId: id } },
          update: { rol: RolTorneo.STAFF },
          create: { usuarioId: usuario.id, torneoId: id, rol: RolTorneo.STAFF },
        });

        // Enviar correo
        await this.resend.emails.send({
          from: this.configService.get<string>('RESEND_FROM')!,
          to: staff.email,
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

        this.logger.log(`Correo de staff enviado a: ${staff.email} para torneo: ${id}`);
      }

      // Eliminar de pendientes
      await this.prisma.staffPendiente.delete({ where: { id: staff.id } });
    }

    this.logger.log(`Torneo publicado: ${id}`);
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
      throw new ForbiddenException('Solo el organizador puede realizar esta acción');
    }
  }
}