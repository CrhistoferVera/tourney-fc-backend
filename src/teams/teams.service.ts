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
import { RolTorneo } from '@prisma/client';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const equipoExistente = await this.prisma.equipo.findFirst({
      where: {
        torneoId,
        jugadores: { some: { usuarioId: userId } },
      },
    });
    if (equipoExistente) {
      throw new BadRequestException(
        'Ya tienes un equipo inscrito en este torneo',
      );
    }

    // Verificar cupo
    const totalEquipos = await this.prisma.equipo.count({
      where: { torneoId },
    });
    if (totalEquipos >= torneo.maxEquipos) {
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
        },
        torneo: { select: { id: true, nombre: true } },
      },
    });

    if (!equipo) throw new NotFoundException('Equipo no encontrado');
    return equipo;
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
}
