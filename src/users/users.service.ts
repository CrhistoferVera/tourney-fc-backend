import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { EstadoInvitacion, TipoInvitacion, RolTorneo } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        email: true,
        fotoPerfil: true,
        zona: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findById(id: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        email: true,
        fotoPerfil: true,
        zona: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async updateMe(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const updated = await this.prisma.usuario.update({
      where: { id: userId },
      data: updateUserDto,
      select: {
        id: true,
        nombre: true,
        email: true,
        fotoPerfil: true,
        zona: true,
        updatedAt: true,
      },
    });

    this.logger.log(`Perfil actualizado: ${userId}`);
    return updated;
  }

  async updatePhoto(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.fotoPerfil) {
      await this.cloudinary.deleteByUrl(user.fotoPerfil).catch(() => null);
    }

    const result = await this.cloudinary.uploadStream(file.buffer, 'profile_photos');

    return this.prisma.usuario.update({
      where: { id: userId },
      data: { fotoPerfil: result.secure_url },
      select: { id: true, fotoPerfil: true },
    });
  }

  async deleteMe(userId: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.usuario.delete({ where: { id: userId } });
    this.logger.log(`Usuario eliminado: ${userId}`);

    return { mensaje: 'Cuenta eliminada exitosamente' };
  }

  async getDashboard(userId: string) {
    // Torneos donde participa el usuario
    const participaciones = await this.prisma.usuarioTorneo.findMany({
      where: { usuarioId: userId },
      include: {
        torneo: {
          include: {
            _count: { select: { inscripciones: { where: { estado: 'APROBADA' } } } },
          },
        },
      },
    });

    const torneos = participaciones
      .map((p) => ({
        id: p.torneo.id,
        nombre: p.torneo.nombre,
        formato: p.torneo.formato,
        estado: p.torneo.estado,
        cantidadEquipos: p.torneo._count.inscripciones,
        rol: p.rol,
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

    // Próximo partido del usuario
    const equiposDelUsuario = await this.prisma.usuarioEquipo.findMany({
      where: { usuarioId: userId },
      select: { equipoId: true },
    });

    const equipoIds = equiposDelUsuario.map((e) => e.equipoId);

    const proximoPartido =
      equipoIds.length > 0
        ? await this.prisma.partido.findFirst({
            where: {
              faseJuego: 'PREVIA',
              estado: { not: 'EN_CURSO' },
              fecha: { gte: new Date() },
              OR: [
                { equipoLocalId: { in: equipoIds } },
                { equipoVisitanteId: { in: equipoIds } },
              ],
            },
            orderBy: { fecha: 'asc' },
            include: {
              equipoLocal: { select: { nombre: true } },
              equipoVisitante: { select: { nombre: true } },
              campo: { select: { nombre: true, direccion: true } },
              torneo: { select: { formato: true } },
            },
          })
        : null;

    const proximoPartidoFormateado = proximoPartido
      ? {
          id: proximoPartido.id,
          fecha: proximoPartido.fecha,
          lugar: proximoPartido.campo?.nombre ?? null,
          direccion: proximoPartido.campo?.direccion ?? null,
          equipoLocal: proximoPartido.equipoLocal.nombre,
          equipoVisitante: proximoPartido.equipoVisitante.nombre,
          fase: proximoPartido.fase,
          formato: proximoPartido.torneo?.formato,
        }
      : null;

    // Últimos resultados confirmados
    const ultimosResultados =
      equipoIds.length > 0
        ? await this.prisma.partido.findMany({
            where: {
              faseJuego: 'FINALIZADO',
              OR: [
                { equipoLocalId: { in: equipoIds } },
                { equipoVisitanteId: { in: equipoIds } },
              ],
            },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            include: {
              equipoLocal: { select: { nombre: true } },
              equipoVisitante: { select: { nombre: true } },
              campo: { select: { nombre: true } },
            },
          })
        : [];

    const ultimosResultadosFormateados = ultimosResultados.map((p) => ({
      id: p.id,
      equipoLocal: p.equipoLocal.nombre,
      equipoVisitante: p.equipoVisitante.nombre,
      golesLocal: p.golesLocal,
      golesVisitante: p.golesVisitante,
      fecha: p.fecha,
      lugar: p.campo?.nombre ?? null,
      estadoConfirmacion: p.estado,
    }));

    return {
      torneos,
      proximoPartido: proximoPartidoFormateado,
      ultimosResultados: ultimosResultadosFormateados,
    };
  }
  async searchUsers(query: string) {
    const searchTerm = query.trim();
    if (!searchTerm) return [];
    return this.prisma.usuario.findMany({
      where: {
        OR: [
          { nombre: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        fotoPerfil: true,
      },
      take: 20,
    });
  }

  async getInvitaciones(userId: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.invitacionPendiente.findMany({
      where: { email: user.email, estado: EstadoInvitacion.PENDIENTE },
      include: {
        torneo: { select: { id: true, nombre: true, imagen: true } },
        equipo: { select: { id: true, nombre: true } },
        invitador: { select: { id: true, nombre: true, fotoPerfil: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async responderInvitacion(
    userId: string,
    invitacionId: string,
    accion: 'aceptar' | 'rechazar',
  ) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const invitacion = await this.prisma.invitacionPendiente.findUnique({
      where: { id: invitacionId },
    });
    if (!invitacion) throw new NotFoundException('Invitación no encontrada');
    if (invitacion.email !== user.email)
      throw new ForbiddenException('No tienes acceso a esta invitación');
    if (invitacion.estado !== EstadoInvitacion.PENDIENTE)
      throw new BadRequestException('Esta invitación ya fue respondida');

    if (accion === 'rechazar') {
      await this.prisma.invitacionPendiente.update({
        where: { id: invitacionId },
        data: { estado: EstadoInvitacion.RECHAZADA, usuarioId: userId },
      });
      return { mensaje: 'Invitación rechazada' };
    }

    // Aceptar
    if (invitacion.tipo === TipoInvitacion.STAFF) {
      if (!invitacion.torneoId) {
        throw new BadRequestException('Invitación de staff sin torneo asociado');
      }
      await this.prisma.usuarioTorneo.upsert({
        where: { usuarioId_torneoId: { usuarioId: userId, torneoId: invitacion.torneoId } },
        update: { rol: RolTorneo.STAFF },
        create: { usuarioId: userId, torneoId: invitacion.torneoId, rol: RolTorneo.STAFF },
      });
    } else if (invitacion.tipo === TipoInvitacion.JUGADOR) {
      if (!invitacion.equipoId) {
        throw new BadRequestException('Invitación de jugador sin equipo asociado');
      }
      const yaEsMiembro = await this.prisma.usuarioEquipo.findUnique({
        where: { usuarioId_equipoId: { usuarioId: userId, equipoId: invitacion.equipoId } },
      });
      if (!yaEsMiembro) {
        await this.prisma.usuarioEquipo.create({
          data: { usuarioId: userId, equipoId: invitacion.equipoId },
        });
      }
      // Si la invitación viene atada a un torneo (legacy), también dar rol JUGADOR ahí.
      // En el modelo nuevo, el rol JUGADOR se asigna al aprobar la inscripción con roster.
      if (invitacion.torneoId) {
        await this.prisma.usuarioTorneo.upsert({
          where: { usuarioId_torneoId: { usuarioId: userId, torneoId: invitacion.torneoId } },
          update: {},
          create: { usuarioId: userId, torneoId: invitacion.torneoId, rol: RolTorneo.JUGADOR },
        });
      }
    }

    await this.prisma.invitacionPendiente.update({
      where: { id: invitacionId },
      data: { estado: EstadoInvitacion.ACEPTADA, usuarioId: userId },
    });

    return { mensaje: 'Invitación aceptada' };
  }
}