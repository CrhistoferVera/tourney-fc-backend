import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolTorneo, EstadoPartido, FormatoTorneo } from '@prisma/client';
import { MatchesService } from '../matches/matches.service';

@Injectable()
export class FixturesService {
  private readonly logger = new Logger(FixturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchesService: MatchesService,
  ) {}

  // Genera el fixture completo del torneo. Solo válido cuando está EN_INSCRIPCION
  // y tiene el cupo completo de equipos aprobados. Si ya existían partidos, los borra
  // y regenera desde cero para evitar inconsistencias.
  async generate(torneoId: string, userId: string) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      include: {
        inscripciones: {
          where: { estado: 'APROBADA' },
          include: { equipo: { select: { id: true } } },
        },
        partidos: true,
      },
    });

    if (!torneo) throw new NotFoundException('Torneo no encontrado');
    await this.checkOrganizadorOStaff(torneoId, userId);

    if (torneo.estado !== 'EN_INSCRIPCION') {
      throw new BadRequestException(
        'Solo se puede generar el fixture cuando el torneo está en período de inscripción',
      );
    }

    const equipos = torneo.inscripciones.map((ins) => ({ id: ins.equipo.id }));

    // Exigir cupo completo antes de generar; un fixture con huecos no tiene sentido
    if (equipos.length < torneo.maxEquipos) {
      throw new BadRequestException(
        `Se necesitan ${torneo.maxEquipos} equipos para generar el fixture. Actualmente hay ${equipos.length}.`,
      );
    }

    if (torneo.partidos.length > 0) {
      await this.prisma.partido.deleteMany({ where: { torneoId } });
    }

    const partidos =
      torneo.formato === FormatoTorneo.LIGA
        ? this.generarLiga(equipos)
        : this.generarCopa(equipos);

    // Los partidos se crean sin fecha; el organizador/staff los programa después
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
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { formato: true },
    });
    if (
      torneo &&
      (torneo.formato === FormatoTorneo.COPA ||
        torneo.formato === FormatoTorneo.ELIMINATORIA)
    ) {
      try {
        await this.matchesService.syncCopaBracket(torneoId);
      } catch (err) {
        this.logger.warn(
          `No se pudo sincronizar bracket de copa para ${torneoId}: ${err.message}`,
        );
      }
    }

    const partidos = await this.prisma.partido.findMany({
      where: { torneoId },
      include: {
        equipoLocal: { select: { id: true, nombre: true, escudo: true } },
        equipoVisitante: { select: { id: true, nombre: true, escudo: true } },
        campo: { select: { id: true, nombre: true, direccion: true } },
      },
      // Orden estructural estable (por creación), consistente con syncCopaBracket.
      // Ordenar por fecha hacía que las casillas del bracket se reordenaran al
      // programar/finalizar partidos, ocultando resultados hasta que todos terminaban.
      orderBy: [{ ronda: 'asc' }, { createdAt: 'asc' }],
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

    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { torneoId, estado: 'APROBADA' },
      include: { equipo: { select: { id: true, nombre: true, escudo: true } } },
      orderBy: { equipo: { nombre: 'asc' } },
    });
    const equipos = inscripciones.map((i) => i.equipo);

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

    // Aplica el resultado de un partido a la fila del equipo:
    // victoria = 3 pts, empate = 1 pt, derrota = 0 pts
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

    // Criterios de desempate en orden: pts > DG > GF > GC (menor es mejor) > nombre A-Z
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

  // Algoritmo Liga — todos contra todos (Round-Robin).
  // Usa el método del polígono: el primer equipo queda fijo y el resto rota
  // en sentido antihorario cada ronda. Con N equipos genera N-1 fechas.
  // Si N es impar se agrega un BYE para completar el ciclo.
  private generarLiga(equipos: { id: string }[]) {
    const partidos: {
      equipoLocalId: string;
      equipoVisitanteId: string;
      ronda: number;
      fase: string;
    }[] = [];
    const n = equipos.length;
    const lista = [...equipos];

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
      // Rotar equipos (el primero fijo, el último pasa al índice 1)
      lista.splice(1, 0, lista.pop()!);
    }

    return partidos;
  }

  // Algoritmo Copa — eliminación directa.
  // Solo genera la primera ronda con emparejamientos aleatorios. Las rondas
  // siguientes las crea syncCopaBracket a medida que se van cerrando partidos.
  // El cuadro se rellena a la siguiente potencia de 2 con BYEs para que
  // el bracket quede simétrico.
  private generarCopa(equipos: { id: string }[]) {
    const partidos: {
      equipoLocalId: string;
      equipoVisitanteId: string;
      ronda: number;
      fase: string;
    }[] = [];
    const shuffled = [...equipos].sort(() => Math.random() - 0.5);

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
      // La siguiente ronda depende de los ganadores reales; no se puede
      // pre-generar. syncCopaBracket se encarga de crear esos partidos.
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
