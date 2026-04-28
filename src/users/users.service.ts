import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
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

  async deleteMe(userId: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
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
          equipos: {
            include: {
              jugadores: true,
            },
          },
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
    cantidadEquipos: p.torneo.equipos.length,
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

  const proximoPartido = equipoIds.length > 0
    ? await this.prisma.partido.findFirst({
        where: {
          estado: 'PENDIENTE',
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
      }
    : null;

  // Últimos resultados confirmados
  const ultimosResultados = equipoIds.length > 0
    ? await this.prisma.partido.findMany({
        where: {
          estado: 'CONFIRMADO',
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
}