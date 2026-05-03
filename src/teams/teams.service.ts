import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { RolTorneo } from '@prisma/client';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Crear equipo dentro de un torneo — el creador se vuelve CAPITAN
  async create(torneoId: string, userId: string, dto: CreateTeamDto) {
    const torneo = await this.prisma.torneo.findUnique({ where: { id: torneoId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');

    const equipo = await this.prisma.equipo.create({
      data: {
        torneoId,
        nombre: dto.nombre,
        escudo: dto.escudo,
        telefonoCapitan: dto.telefonoCapitan,
      },
    });

    // Agregar al usuario como jugador del equipo
    await this.prisma.usuarioEquipo.create({
      data: { usuarioId: userId, equipoId: equipo.id },
    });

    // Asignar rol CAPITAN en el torneo
    await this.prisma.usuarioTorneo.upsert({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
      update: { rol: RolTorneo.CAPITAN },
      create: { usuarioId: userId, torneoId, rol: RolTorneo.CAPITAN },
    });

    this.logger.log(`Equipo creado: ${equipo.id} en torneo: ${torneoId} por usuario: ${userId}`);
    return equipo;
  }

  // Listar equipos de un torneo
  async findAll(torneoId: string) {
    const equipos = await this.prisma.equipo.findMany({
      where: { torneoId },
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
      cantidadJugadores: e._count.jugadores,
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
        },
        torneo: { select: { id: true, nombre: true } },
      },
    });

    if (!equipo) throw new NotFoundException('Equipo no encontrado');
    return equipo;
  }

  // Editar equipo — solo CAPITAN u ORGANIZADOR/STAFF
  async update(equipoId: string, userId: string, dto: UpdateTeamDto) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id: equipoId } });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    await this.checkCapitanOSuperior(equipo.torneoId, userId);

    const updated = await this.prisma.equipo.update({
      where: { id: equipoId },
      data: dto,
    });

    this.logger.log(`Equipo actualizado: ${equipoId}`);
    return updated;
  }

  // Eliminar equipo — solo ORGANIZADOR o STAFF
  async remove(equipoId: string, userId: string) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id: equipoId } });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    await this.checkOrganizadorOStaff(equipo.torneoId, userId);

    await this.prisma.equipo.delete({ where: { id: equipoId } });
    this.logger.log(`Equipo eliminado: ${equipoId}`);

    return { mensaje: 'Equipo eliminado exitosamente' };
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
    if (yaEsMiembro) throw new ForbiddenException('Ya eres miembro de este equipo');

    await this.prisma.usuarioEquipo.create({
      data: { usuarioId: userId, equipoId },
    });

    // Asignar rol JUGADOR en el torneo si no tiene rol
    await this.prisma.usuarioTorneo.upsert({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId: equipo.torneoId } },
      update: {},
      create: { usuarioId: userId, torneoId: equipo.torneoId, rol: RolTorneo.JUGADOR },
    });

    this.logger.log(`Usuario ${userId} se unió al equipo ${equipoId}`);
    return { mensaje: 'Te has unido al equipo exitosamente' };
  }

  // Helpers de rol
  private async checkCapitanOSuperior(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    const rolesPermitidos: RolTorneo[] = [RolTorneo.CAPITAN, RolTorneo.ORGANIZADOR, RolTorneo.STAFF];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }
  }

  private async checkOrganizadorOStaff(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    const rolesPermitidos: RolTorneo[] = [RolTorneo.ORGANIZADOR, RolTorneo.STAFF];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException('Solo el organizador o staff puede realizar esta acción');
    }
  }
}