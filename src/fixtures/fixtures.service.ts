import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolTorneo, EstadoPartido, FormatoTorneo } from '@prisma/client';

@Injectable()
export class FixturesService {
  private readonly logger = new Logger(FixturesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Generar fixture — HU-15
  async generate(torneoId: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      include: {
        equipos: true,
        partidos: true,
      },
    });

    if (!torneo) throw new NotFoundException('Torneo no encontrado');
    await this.checkOrganizadorOStaff(torneoId, userId);

    if (torneo.equipos.length < 2) {
      throw new BadRequestException('Se necesitan al menos 2 equipos para generar el fixture');
    }

    // Eliminar partidos anteriores si existen
    if (torneo.partidos.length > 0) {
      await this.prisma.partido.deleteMany({ where: { torneoId } });
    }

    const equipos = torneo.equipos;
    const partidos = torneo.formato === FormatoTorneo.LIGA
      ? this.generarLiga(equipos)
      : this.generarCopa(equipos);

    // Distribuir fechas dentro del rango del torneo
    const fechaInicio = new Date(torneo.fechaInicio);
    const fechaFin = new Date(torneo.fechaFin);
    const totalDias = Math.floor((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24));
    const intervaloDias = totalDias > 0 && partidos.length > 0
      ? Math.floor(totalDias / partidos.length)
      : 1;

    const partidosConFecha = partidos.map((p, i) => {
      const fecha = new Date(fechaInicio);
      fecha.setDate(fecha.getDate() + i * intervaloDias);
      return { ...p, torneoId, fecha, estado: EstadoPartido.PENDIENTE };
    });

    await this.prisma.partido.createMany({ data: partidosConFecha });

    this.logger.log(`Fixture generado para torneo: ${torneoId} con ${partidosConFecha.length} partidos`);

    return this.findAll(torneoId);
  }

  // Ver fixture completo — HU-23
  async findAll(torneoId: string) {
    const partidos = await this.prisma.partido.findMany({
      where: { torneoId },
      include: {
        equipoLocal: { select: { id: true, nombre: true, escudo: true } },
        equipoVisitante: { select: { id: true, nombre: true, escudo: true } },
        campo: { select: { id: true, nombre: true, direccion: true } },
      },
      orderBy: [{ ronda: 'asc' }, { fecha: 'asc' }],
    });

    // Agrupar por ronda
    const porRonda = partidos.reduce((acc, p) => {
      const ronda = p.ronda ?? 1;
      if (!acc[ronda]) acc[ronda] = [];
      acc[ronda].push(p);
      return acc;
    }, {} as Record<number, typeof partidos>);

    return Object.entries(porRonda).map(([ronda, ps]) => ({
      ronda: Number(ronda),
      label: `Fecha ${ronda}`,
      partidos: ps,
    }));
  }

  // Ver fixture de un equipo — HU-19
  async findByEquipo(torneoId: string, equipoId: string) {
    return this.prisma.partido.findMany({
      where: {
        torneoId,
        OR: [{ equipoLocalId: equipoId }, { equipoVisitanteId: equipoId }],
      },
      include: {
        equipoLocal: { select: { id: true, nombre: true, escudo: true } },
        equipoVisitante: { select: { id: true, nombre: true, escudo: true } },
        campo: { select: { id: true, nombre: true, direccion: true } },
      },
      orderBy: [{ ronda: 'asc' }, { fecha: 'asc' }],
    });
  }

  // Algoritmo Liga — todos contra todos
  private generarLiga(equipos: { id: string }[]) {
    const partidos: { equipoLocalId: string; equipoVisitanteId: string; ronda: number; fase: string }[] = [];
    const n = equipos.length;
    const lista = [...equipos];

    // Si número impar, agregar bye
    if (n % 2 !== 0) lista.push({ id: 'BYE' });

    const totalRondas = lista.length - 1;
    const mitad = lista.length / 2;

    for (let ronda = 0; ronda < totalRondas; ronda++) {
      for (let i = 0; i < mitad; i++) {
        const local = lista[i];
        const visitante = lista[lista.length - 1 - i];
        if (local.id !== 'BYE' && visitante.id !== 'BYE') {
          partidos.push({
            equipoLocalId: local.id,
            equipoVisitanteId: visitante.id,
            ronda: ronda + 1,
            fase: `Fecha ${ronda + 1}`,
          });
        }
      }
      // Rotar equipos (el primero fijo)
      lista.splice(1, 0, lista.pop()!);
    }

    return partidos;
  }

  // Algoritmo Copa — eliminación directa
  private generarCopa(equipos: { id: string }[]) {
    const partidos: { equipoLocalId: string; equipoVisitanteId: string; ronda: number; fase: string }[] = [];
    const shuffled = [...equipos].sort(() => Math.random() - 0.5);

    // Rellenar con BYE si no es potencia de 2
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));
    while (shuffled.length < nextPow2) shuffled.push({ id: 'BYE' });

    let ronda = 1;
    let equiposRonda = shuffled;

    while (equiposRonda.length > 1) {
      const faseLabel = this.getFaseLabel(equiposRonda.length);
      for (let i = 0; i < equiposRonda.length; i += 2) {
        const local = equiposRonda[i];
        const visitante = equiposRonda[i + 1];
        if (local.id !== 'BYE' && visitante.id !== 'BYE') {
          partidos.push({
            equipoLocalId: local.id,
            equipoVisitanteId: visitante.id,
            ronda,
            fase: faseLabel,
          });
        }
      }
      // En Copa real, la siguiente ronda depende de los ganadores
      // Por ahora solo generamos la primera ronda completa
      break;
    }

    return partidos;
  }

  private getFaseLabel(cantEquipos: number): string {
    if (cantEquipos === 2) return 'Final';
    if (cantEquipos === 4) return 'Semifinal';
    if (cantEquipos === 8) return 'Cuartos de final';
    return `Ronda de ${cantEquipos}`;
  }

  private async checkOrganizadorOStaff(torneoId: string, userId: string) {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    const rolesPermitidos: RolTorneo[] = [RolTorneo.ORGANIZADOR, RolTorneo.STAFF];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException('Solo el organizador o staff puede generar el fixture');
    }
  }
}