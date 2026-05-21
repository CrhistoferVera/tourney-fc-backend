import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolTorneo, EstadoPartido, FormatoTorneo } from '@prisma/client';

@Injectable()
export class FixturesService {
  private readonly logger = new Logger(FixturesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generate(torneoId: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      include: { equipos: true, partidos: true },
    });

    if (!torneo) throw new NotFoundException('Torneo no encontrado');
    await this.checkOrganizadorOStaff(torneoId, userId);

    if (torneo.estado !== 'EN_INSCRIPCION') {
      throw new BadRequestException(
        'Solo se puede generar el fixture cuando el torneo está en período de inscripción',
      );
    }

    if (torneo.equipos.length < torneo.maxEquipos) {
      throw new BadRequestException(
        `Se necesitan ${torneo.maxEquipos} equipos para generar el fixture. Actualmente hay ${torneo.equipos.length}.`,
      );
    }

    if (torneo.partidos.length > 0) {
      await this.prisma.partido.deleteMany({ where: { torneoId } });
    }

    const equipos = torneo.equipos;
    const partidos =
      torneo.formato === FormatoTorneo.LIGA
        ? this.generarLiga(equipos)
        : this.generarCopa(equipos);

    const partidosSinFecha = partidos.map((p) => ({
      ...p,
      torneoId,
      fecha: null,
      estado: EstadoPartido.PENDIENTE,
    }));

    await this.prisma.partido.createMany({ data: partidosSinFecha });

    this.logger.log(
      `Fixture generado para torneo: ${torneoId} con ${partidosSinFecha.length} partidos`,
    );
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
    const porRonda = partidos.reduce(
      (acc, p) => {
        const ronda = p.ronda ?? 1;
        if (!acc[ronda]) acc[ronda] = [];
        acc[ronda].push(p);
        return acc;
      },
      {} as Record<number, typeof partidos>,
    );

    return Object.entries(porRonda).map(([ronda, ps]) => ({
      ronda: Number(ronda),
      label: `Fecha ${ronda}`,
      partidos: ps,
    }));
  }

  // Tabla de posiciones — solo formato LIGA
  async getStandings(torneoId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { id: true, nombre: true, formato: true },
    });
    if (!torneo) throw new NotFoundException('Torneo no encontrado');
    if (torneo.formato !== FormatoTorneo.LIGA) {
      throw new BadRequestException(
        'La tabla de posiciones solo está disponible para torneos en formato Liga',
      );
    }

    const equipos = await this.prisma.equipo.findMany({
      where: { torneoId, inscripcion: { estado: 'APROBADA' } },
      select: { id: true, nombre: true, escudo: true },
      orderBy: { nombre: 'asc' },
    });

    type FilaTabla = {
      equipo: { id: string; nombre: string; escudo: string | null };
      pj: number;
      g: number;
      e: number;
      p: number;
      gf: number;
      gc: number;
      dg: number;
      pts: number;
    };

    const filas = new Map<string, FilaTabla>(
      equipos.map((e) => [
        e.id,
        {
          equipo: e,
          pj: 0,
          g: 0,
          e: 0,
          p: 0,
          gf: 0,
          gc: 0,
          dg: 0,
          pts: 0,
        },
      ]),
    );

    const partidos = await this.prisma.partido.findMany({
      where: {
        torneoId,
        estado: EstadoPartido.CONFIRMADO,
        golesLocal: { not: null },
        golesVisitante: { not: null },
      },
      select: {
        equipoLocalId: true,
        equipoVisitanteId: true,
        golesLocal: true,
        golesVisitante: true,
      },
    });

    const aplicarResultado = (
      equipoId: string,
      golesFavor: number,
      golesContra: number,
    ) => {
      const fila = filas.get(equipoId);
      if (!fila) return;
      fila.pj += 1;
      fila.gf += golesFavor;
      fila.gc += golesContra;
      fila.dg = fila.gf - fila.gc;
      if (golesFavor > golesContra) {
        fila.g += 1;
        fila.pts += 3;
      } else if (golesFavor < golesContra) {
        fila.p += 1;
      } else {
        fila.e += 1;
        fila.pts += 1;
      }
    };

    for (const partido of partidos) {
      aplicarResultado(
        partido.equipoLocalId,
        partido.golesLocal!,
        partido.golesVisitante!,
      );
      aplicarResultado(
        partido.equipoVisitanteId,
        partido.golesVisitante!,
        partido.golesLocal!,
      );
    }

    const tabla = [...filas.values()]
      .sort(
        (a, b) =>
          b.pts - a.pts ||
          b.dg - a.dg ||
          b.gf - a.gf ||
          a.gc - b.gc ||
          a.equipo.nombre.localeCompare(b.equipo.nombre, 'es'),
      )
      .map((fila, index) => ({
        posicion: index + 1,
        ...fila,
      }));

    return {
      torneoId: torneo.id,
      torneoNombre: torneo.nombre,
      formato: torneo.formato,
      criteriosDesempate: [
        'Puntos (mayor a menor)',
        'Diferencia de goles (DG)',
        'Goles a favor (GF)',
        'Goles en contra (GC, menor es mejor)',
        'Nombre del equipo (A–Z)',
      ],
      tabla,
    };
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
    const partidos: {
      equipoLocalId: string;
      equipoVisitanteId: string;
      ronda: number;
      fase: string;
    }[] = [];
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
    const partidos: {
      equipoLocalId: string;
      equipoVisitanteId: string;
      ronda: number;
      fase: string;
    }[] = [];
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
    const rolesPermitidos: RolTorneo[] = [
      RolTorneo.ORGANIZADOR,
      RolTorneo.STAFF,
    ];
    if (!participacion || !rolesPermitidos.includes(participacion.rol)) {
      throw new ForbiddenException(
        'Solo el organizador o staff puede generar el fixture',
      );
    }
  }
}
