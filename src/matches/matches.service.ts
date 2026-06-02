import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchControlDto, MatchControlAction } from './dto/match-control.dto';
import { MatchEventDto } from './dto/match-event.dto';
import { EstadoPartido, RolTorneo, FaseJuego, TipoEvento, FormatoTorneo, EstadoTorneo } from '@prisma/client';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Ver detalle de un partido — HU-24
  async findOne(partidoId: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      include: {
        equipoLocal: { select: { id: true, nombre: true, escudo: true } },
        equipoVisitante: { select: { id: true, nombre: true, escudo: true } },
        campo: { select: { id: true, nombre: true, direccion: true } },
        torneo: {
          select: { id: true, nombre: true, fechaInicio: true, fechaFin: true, estado: true, formato: true },
        },
        eventos: {
          include: {
            jugador: { select: { id: true, nombre: true } },
            equipo: { select: { id: true, nombre: true, escudo: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!partido) throw new NotFoundException('Partido no encontrado');

    const ganadorTorneo = await this.resolveGanadorTorneoForViewer(partido);

    return { ...partido, ganadorTorneo };
  }

  /** Ganador para espectadores: torneo finalizado o final de copa recién jugada. */
  async resolveGanadorTorneoForViewer(partido: {
    id: string;
    torneoId: string;
    fase: string | null;
    faseJuego: FaseJuego;
    golesLocal: number | null;
    golesVisitante: number | null;
    golesPenalesLocal: number | null;
    golesPenalesVisitante: number | null;
    equipoLocalId: string;
    equipoVisitanteId: string;
    torneo: { estado: string; formato: FormatoTorneo };
  }): Promise<{ nombre: string; escudo: string | null } | null> {
    if (partido.torneo.estado === 'FINALIZADO') {
      return this.getGanadorTorneo(partido.torneoId);
    }
    if (
      partido.faseJuego === FaseJuego.FINALIZADO &&
      partido.fase === 'Final' &&
      (partido.torneo.formato === FormatoTorneo.COPA ||
        partido.torneo.formato === FormatoTorneo.ELIMINATORIA)
    ) {
      const winnerId = this.getCopaWinnerId(partido);      if (!winnerId) return null;      const equipo = await this.prisma.equipo.findUnique({
        where: { id: winnerId },
        select: { nombre: true, escudo: true },
      });
      return equipo;
    }
    return null;
  }

  async getGanadorTorneo(
    torneoId: string,
  ): Promise<{ nombre: string; escudo: string | null } | null> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { estado: true, formato: true },
    });
    if (!torneo || torneo.estado !== 'FINALIZADO') return null;

    if (torneo.formato === FormatoTorneo.LIGA) {
      return this.getStandingsWinner(torneoId);
    }

    const final = await this.prisma.partido.findFirst({
      where: {
        torneoId,
        fase: 'Final',
        faseJuego: FaseJuego.FINALIZADO,
      },
      orderBy: { finalizadoEn: 'desc' },
    });
    if (!final) return null;

    const winnerId = this.getCopaWinnerId(final);
    if (!winnerId) return null;
    
    return this.prisma.equipo.findUnique({
      where: { id: winnerId },
      select: { nombre: true, escudo: true },
    });
  }

  // Editar fecha o cancha — CAPITAN, ORGANIZADOR o STAFF (si está PENDIENTE)
  async update(partidoId: string, userId: string, dto: UpdateMatchDto) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      include: { torneo: true },
    });
    if (!partido) throw new NotFoundException('Partido no encontrado');

    const rol = await this.getRol(partido.torneoId, userId);

    // Si está en curso, no se permite editar
    if (partido.estado === EstadoPartido.EN_CURSO) {
      throw new BadRequestException('No se puede editar un partido que ya está en curso');
    }

    // Si está FINALIZADO, no se permite editar
    if (partido.faseJuego === FaseJuego.FINALIZADO) {
      throw new BadRequestException('No se puede editar un partido finalizado');
    }

    // Si está CONFIRMADO, solo ORGANIZADOR o STAFF pueden cambiar estado a PENDIENTE
    if (partido.estado === EstadoPartido.CONFIRMADO) {
      const rolesSuperiores: RolTorneo[] = [
        RolTorneo.ORGANIZADOR,
        RolTorneo.STAFF,
      ];
      if (!rolesSuperiores.includes(rol)) {
        throw new ForbiddenException(
          'Solo el organizador o staff puede modificar un partido confirmado',
        );
      }
      // Solo permite cambiar estado a PENDIENTE
      if (dto.estado && dto.estado !== EstadoPartido.PENDIENTE) {
        throw new BadRequestException(
          'Un partido confirmado solo puede volver a PENDIENTE',
        );
      }
    }

    // Validar que la fecha esté dentro del rango del torneo
    if (dto.fecha) {
      const fecha = new Date(dto.fecha);
      const fechaInicio = new Date(partido.torneo.fechaInicio);
      const fechaFin = new Date(partido.torneo.fechaFin);
      const limitFin = new Date(fechaFin);
      limitFin.setUTCHours(23, 59, 59, 999);
      if (fecha < fechaInicio || fecha > limitFin) {
        throw new BadRequestException(
          `La fecha debe estar entre ${fechaInicio.toLocaleDateString()} y ${fechaFin.toLocaleDateString()}`,
        );
      }

      // No se deberia programar un partido 3 horas antes de que finalice el torneo
      const threeHoursMs = 3 * 60 * 60 * 1000;
      if (fecha.getTime() > fechaFin.getTime() - threeHoursMs) {
        throw new BadRequestException(
          'No se puede programar un partido dentro de las 3 horas previas al final del torneo',
        );
      }
    }

    // Validar conflicto de cancha (diferencia mínima de 1:15h para F5/F7, 2h para F11)
    const targetFecha = dto.fecha ? new Date(dto.fecha) : partido.fecha;
    const targetCampoId = dto.campoId !== undefined ? dto.campoId : partido.campoId;

    if (targetFecha && targetCampoId) {
      await this.assertNoCampoConflict(
        partido.torneoId,
        partidoId,
        targetCampoId,
        targetFecha,
        partido.torneo.modalidad ?? 'FUTBOL_5',
      );
    }

    // Validar que la cancha pertenece al torneo
    if (dto.campoId) {
      const campo = await this.prisma.campoJuego.findFirst({
        where: { id: dto.campoId, torneoId: partido.torneoId },
      });
      if (!campo)
        throw new BadRequestException('La cancha no pertenece a este torneo');
    }

    // CAPITAN solo puede editar si el partido está PENDIENTE
    if (
      rol === RolTorneo.CAPITAN &&
      partido.estado !== EstadoPartido.PENDIENTE
    ) {
      throw new ForbiddenException(
        'El capitán solo puede editar partidos pendientes',
      );
    }

    // CAPITAN no puede cambiar estado
    if (rol === RolTorneo.CAPITAN && dto.estado) {
      throw new ForbiddenException(
        'El capitán no puede cambiar el estado del partido',
      );
    }

    // Determinar si se debe cambiar estado a CONFIRMADO
    // Se cambia cuando se asigna fecha o cancha, el partido está PENDIENTE, y el torneo está EN_INSCRIPCION o EN_CURSO
    const shouldConfirmFromSchedule =
      (dto.fecha || dto.campoId !== undefined) &&
      partido.estado === EstadoPartido.PENDIENTE &&
      (partido.torneo.estado === EstadoTorneo.EN_INSCRIPCION ||
        partido.torneo.estado === EstadoTorneo.EN_CURSO);

    const updated = await this.prisma.partido.update({
      where: { id: partidoId },
      data: {
        ...(dto.estado && { estado: dto.estado }),
        ...(dto.fecha && { fecha: new Date(dto.fecha) }),
        ...(dto.campoId !== undefined && { campoId: dto.campoId }),
        ...(shouldConfirmFromSchedule && { estado: EstadoPartido.CONFIRMADO }),
        ...(dto.golesLocal !== undefined && { golesLocal: dto.golesLocal }),
        ...(dto.golesVisitante !== undefined && { golesVisitante: dto.golesVisitante }),
        ...(dto.golesPenalesLocal !== undefined && { golesPenalesLocal: dto.golesPenalesLocal }),
        ...(dto.golesPenalesVisitante !== undefined && { golesPenalesVisitante: dto.golesPenalesVisitante }),
      },
      include: {
        equipoLocal: { select: { id: true, nombre: true } },
        equipoVisitante: { select: { id: true, nombre: true } },
        campo: { select: { id: true, nombre: true } },
      },
    });

    if (updated.faseJuego === FaseJuego.FINALIZADO) {
      await this.handleMatchEndActions(partidoId, updated);
    }

    this.logger.log(`Partido ${partidoId} actualizado`);
    return updated;
  }

  // Confirmar partido — ORGANIZADOR o STAFF
  async confirm(partidoId: string, userId: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
    });
    if (!partido) throw new NotFoundException('Partido no encontrado');

    await this.checkOrganizadorOStaff(partido.torneoId, userId);

    if (partido.estado === EstadoPartido.CONFIRMADO) {
      throw new BadRequestException('El partido ya está confirmado');
    }

    const updated = await this.prisma.partido.update({
      where: { id: partidoId },
      data: { estado: EstadoPartido.CONFIRMADO },
    });

    this.logger.log(`Partido ${partidoId} confirmado`);
    return updated;
  }

  async confirmAll(torneoId: string, userId: string) {
    await this.checkOrganizadorOStaff(torneoId, userId);

    const sinFecha = await this.prisma.partido.count({
      where: { torneoId, fecha: null },
    });
    if (sinFecha > 0) {
      throw new BadRequestException(
        'Todos los partidos deben tener fecha, hora y cancha asignadas antes de confirmar el fixture',
      );
    }

    await this.prisma.partido.updateMany({
      where: { torneoId, estado: EstadoPartido.PENDIENTE },
      data: { estado: EstadoPartido.CONFIRMADO },
    });

    await this.prisma.torneo.update({
      where: { id: torneoId },
      data: { estado: 'EN_CURSO' },
    });

    this.logger.log(`Todos los partidos del torneo ${torneoId} confirmados`);
    return { mensaje: 'Todos los partidos confirmados y torneo iniciado' };
  }

  private async getRol(torneoId: string, userId: string): Promise<RolTorneo> {
    const participacion = await this.prisma.usuarioTorneo.findUnique({
      where: { usuarioId_torneoId: { usuarioId: userId, torneoId } },
    });
    if (!participacion)
      throw new ForbiddenException('No participas en este torneo');
    return participacion.rol;
  }

  private async checkOrganizadorOStaff(torneoId: string, userId: string) {
    const rol = await this.getRol(torneoId, userId);
    const rolesPermitidos: RolTorneo[] = [
      RolTorneo.ORGANIZADOR,
      RolTorneo.STAFF,
    ];
    if (!rolesPermitidos.includes(rol)) {
      throw new ForbiddenException(
        'Solo el organizador o staff puede realizar esta acción',
      );
    }
  }

  // ---- Control de Partido en Vivo ----

  async controlLiveMatch(partidoId: string, userId: string, dto: MatchControlDto) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      include: { torneo: true },
    });
    if (!partido) throw new NotFoundException('Partido no encontrado');
    await this.checkOrganizadorOStaff(partido.torneoId, userId);

    let data: any = {};
    const now = new Date();

    if (dto.action === MatchControlAction.START_FIRST_HALF) {
      if (partido.torneo.estado !== EstadoTorneo.EN_CURSO) {
        throw new BadRequestException(
          'El torneo debe estar en curso para iniciar partidos. Cierra las inscripciones primero.',
        );
      }
      if (partido.estado !== EstadoPartido.CONFIRMADO) {
        throw new BadRequestException('No se puede iniciar un partido que no está en estado Confirmado. Primero debes programarlo.');
      }
      data.estado = EstadoPartido.EN_CURSO;
      data.faseJuego = FaseJuego.PRIMER_TIEMPO;
      data.cronometroIniciadoEn = now;
      data.finalizadoEn = null;
      if (partido.golesLocal === null) data.golesLocal = 0;
      if (partido.golesVisitante === null) data.golesVisitante = 0;
    } else if (dto.action === MatchControlAction.PAUSE_HALF_TIME) {
      data.faseJuego = FaseJuego.MEDIO_TIEMPO;
      // Guardar el tiempo jugado hasta el momento
      if (partido.cronometroIniciadoEn) {
        const diffMs = now.getTime() - partido.cronometroIniciadoEn.getTime();
        data.minutosJugados = partido.minutosJugados + Math.floor(diffMs / 60000);
      }
      data.cronometroIniciadoEn = null;
    } else if (dto.action === MatchControlAction.START_SECOND_HALF) {
      data.faseJuego = FaseJuego.SEGUNDO_TIEMPO;
      data.cronometroIniciadoEn = now;
      data.finalizadoEn = null;
      
      // Reiniciar minutosJugados al límite reglamentario del primer tiempo
      let limit = 25; // default FUTBOL_5 y FUTBOL_7
      if (partido.torneo.modalidad === 'FUTBOL_11') limit = 45;
      data.minutosJugados = limit;
    } else if (dto.action === MatchControlAction.START_PENALTIES) {
      data.faseJuego = FaseJuego.PENALES;
      data.cronometroIniciadoEn = null;
      data.finalizadoEn = null;
      if (partido.golesPenalesLocal === null) data.golesPenalesLocal = 0;
      if (partido.golesPenalesVisitante === null) data.golesPenalesVisitante = 0;
    } else if (dto.action === MatchControlAction.END_MATCH) {
      const isCopa = partido.torneo.formato === FormatoTorneo.COPA || partido.torneo.formato === FormatoTorneo.ELIMINATORIA;
      const currentGolesLocal = partido.golesLocal ?? 0;
      const currentGolesVisitante = partido.golesVisitante ?? 0;
      const isEmpate = currentGolesLocal === currentGolesVisitante;

      // Calculamos tiempo total si el cronómetro estaba iniciado
      if (partido.cronometroIniciadoEn) {
        const diffMs = now.getTime() - partido.cronometroIniciadoEn.getTime();
        data.minutosJugados = partido.minutosJugados + Math.floor(diffMs / 60000);
      }
      data.cronometroIniciadoEn = null;

      if (isCopa && isEmpate && partido.faseJuego !== FaseJuego.PENALES) {
        data.faseJuego = FaseJuego.PENALES;
        data.estado = EstadoPartido.EN_CURSO;
        if (partido.golesPenalesLocal === null) data.golesPenalesLocal = 0;
        if (partido.golesPenalesVisitante === null) data.golesPenalesVisitante = 0;
      } else {
        data.faseJuego = FaseJuego.FINALIZADO;
        data.finalizadoEn = now;
        data.estado =
          partido.torneo.formato === FormatoTorneo.LIGA
            ? EstadoPartido.CONFIRMADO
            : EstadoPartido.EN_DISPUTA;
        if (dto.golesPenalesLocal !== undefined) {
          data.golesPenalesLocal = dto.golesPenalesLocal;
        }
        if (dto.golesPenalesVisitante !== undefined) {
          data.golesPenalesVisitante = dto.golesPenalesVisitante;
        }
      }
    }

    const updated = await this.prisma.partido.update({
      where: { id: partidoId },
      data,
    });

    this.logger.log(`Partido ${partidoId} cambió de fase a ${updated.faseJuego}`);

    // Auto-advancement in Cup brackets if match ended
    if (dto.action === MatchControlAction.END_MATCH && updated.faseJuego === FaseJuego.FINALIZADO) {
      const torneo = partido.torneo;
      if (
        torneo &&
        (torneo.formato === FormatoTorneo.COPA ||
          torneo.formato === FormatoTorneo.ELIMINATORIA)
      ) {
        try {
          await this.syncCopaBracket(partido.torneoId);
        } catch (err) {
          this.logger.error(`Error al avanzar ganador en copa: ${(err as Error).message}`);
        }
      }
    }

    let ganadorTorneo: any = null;
    if (dto.action === MatchControlAction.END_MATCH && updated.faseJuego === FaseJuego.FINALIZADO) {
      const torneo = partido.torneo;
      if (torneo) {
        if (torneo.formato === FormatoTorneo.LIGA) {
          const pendingMatchesCount = await this.prisma.partido.count({
            where: {
              torneoId: partido.torneoId,
              id: { not: partido.id },
              faseJuego: { not: FaseJuego.FINALIZADO },
            },
          });
          if (pendingMatchesCount === 0) {
            await this.prisma.torneo.update({
              where: { id: partido.torneoId },
              data: { estado: 'FINALIZADO' },
            });
            ganadorTorneo = await this.getStandingsWinner(partido.torneoId);
          }
        } else {
          if (partido.fase === 'Final') {
            await this.prisma.torneo.update({
              where: { id: partido.torneoId },
              data: { estado: 'FINALIZADO' },
            });
            const currentGolesLocal = updated.golesLocal ?? 0;
            const currentGolesVisitante = updated.golesVisitante ?? 0;
            let winnerId: string;
            if (currentGolesLocal > currentGolesVisitante) {
              winnerId = updated.equipoLocalId;
            } else if (currentGolesVisitante > currentGolesLocal) {
              winnerId = updated.equipoVisitanteId;
            } else {
              const penLocal = updated.golesPenalesLocal ?? 0;
              const penVis = updated.golesPenalesVisitante ?? 0;
              winnerId = penLocal >= penVis ? updated.equipoLocalId : updated.equipoVisitanteId;
            }
            ganadorTorneo = await this.prisma.equipo.findUnique({
              where: { id: winnerId },
              select: { nombre: true, escudo: true },
            });
          }
        }
      }
    }

    return { ...updated, ganadorTorneo };
  }

  async addEvent(partidoId: string, userId: string, dto: MatchEventDto) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
    });
    if (!partido) throw new NotFoundException('Partido no encontrado');
    await this.checkOrganizadorOStaff(partido.torneoId, userId);

    // No se pueden editar los goles de tiempo regular en un partido con tanda de penales
    if (partido.faseJuego === FaseJuego.FINALIZADO && partido.golesPenalesLocal !== null && partido.golesPenalesVisitante !== null) {
      if (dto.tipo === TipoEvento.GOL && dto.detalle !== 'PENAL') {
        throw new BadRequestException('No se pueden editar los goles de tiempo regular en un partido con tanda de penales.');
      }
    }

    // Validar que las tarjetas amarillas y rojas se asignen solo a jugadores
    if (
      (dto.tipo === TipoEvento.TARJETA_AMARILLA || dto.tipo === TipoEvento.TARJETA_ROJA) &&
      !dto.jugadorId
    ) {
      throw new BadRequestException('Las tarjetas amarillas y rojas deben ser asignadas a un jugador');
    }

    // No se permiten registrar eventos en partidos finalizados
    if (partido.faseJuego === FaseJuego.FINALIZADO) {
      throw new BadRequestException('No se pueden registrar eventos en un partido finalizado');
    }

    // Validaciones específicas para tanda de penales
    const isPenal = partido.faseJuego === FaseJuego.PENALES || dto.detalle === 'PENAL' || dto.tipo === TipoEvento.PENAL_FALLADO;
    if (isPenal) {
      if (partido.faseJuego === FaseJuego.PENALES && !dto.jugadorId) {
        throw new BadRequestException('Se requiere asignar un jugador para el penal.');
      }

      // Obtener todos los eventos de penal de la tanda de este partido
      const events = await this.prisma.eventoPartido.findMany({
        where: {
          partidoId,
          OR: [
            { tipo: TipoEvento.PENAL_FALLADO },
            { tipo: TipoEvento.GOL, detalle: 'PENAL' },
            {
              partido: { faseJuego: FaseJuego.PENALES }
            }
          ],
        },
        orderBy: { createdAt: 'asc' },
      });

      const penaltyEvents = events.filter(ev => 
        ev.detalle === 'PENAL' || 
        ev.tipo === TipoEvento.PENAL_FALLADO ||
        ev.minuto === null || 
        ev.minuto === undefined
      );

      // 1. Validar alternancia: par -> Local, impar -> Visitante
      const K = penaltyEvents.length;
      if (K % 2 === 0) {
        if (dto.equipoId !== partido.equipoLocalId) {
          throw new BadRequestException('Es el turno del equipo local para patear.');
        }
      } else {
        if (dto.equipoId !== partido.equipoVisitanteId) {
          throw new BadRequestException('Es el turno del equipo visitante para patear.');
        }
      }

      // 2. Validar que no repita tiro en el ciclo actual de pateadores
      if (dto.jugadorId) {
        const eligiblePlayers = await this.getEligiblePlayers(partidoId, dto.equipoId);
        const N = eligiblePlayers.length;

        if (N > 0) {
          const teamPenalties = penaltyEvents.filter(ev => ev.equipoId === dto.equipoId && ev.jugadorId !== null);
          const TK = teamPenalties.length; // Tiros ya realizados por su equipo
          const cycleIndex = Math.floor(TK / N);
          const cycleStartIndex = cycleIndex * N;
          const kickedInCurrentCycle = teamPenalties.slice(cycleStartIndex).map(ev => ev.jugadorId);

          if (kickedInCurrentCycle.includes(dto.jugadorId)) {
            throw new BadRequestException('El jugador ya ha pateado en esta ronda/ciclo de penales.');
          }
        }
      }
    }

    if (dto.tipo === TipoEvento.GOL && dto.asistenciaJugadorId && dto.jugadorId === dto.asistenciaJugadorId) {
      throw new BadRequestException(
        'El jugador que anotó el gol no puede ser el mismo que da la asistencia',
      );
    }

    const evento = await this.prisma.eventoPartido.create({
      data: {
        partidoId,
        tipo: dto.tipo,
        equipoId: dto.equipoId,
        jugadorId: dto.jugadorId,
        minuto: dto.minuto,
        detalle: dto.detalle,
      },
      include: {
        jugador: { select: { id: true, nombre: true } },
        equipo: { select: { id: true, nombre: true, escudo: true } },
      }
    });

    // Actualizar goles si es GOL regular
    if (dto.tipo === TipoEvento.GOL) {
      const isPenalEvent = partido.faseJuego === FaseJuego.PENALES || dto.detalle === 'PENAL';
      if (!isPenalEvent) {
        if (dto.equipoId === partido.equipoLocalId) {
          await this.prisma.partido.update({
            where: { id: partidoId },
            data: { golesLocal: { increment: 1 } },
          });
        } else if (dto.equipoId === partido.equipoVisitanteId) {
          await this.prisma.partido.update({
            where: { id: partidoId },
            data: { golesVisitante: { increment: 1 } },
          });
        }
      }
    }

    if (dto.tipo === TipoEvento.GOL && dto.asistenciaJugadorId) {
      await this.prisma.eventoPartido.create({
        data: {
          partidoId,
          tipo: TipoEvento.ASISTENCIA,
          equipoId: dto.equipoId,
          jugadorId: dto.asistenciaJugadorId,
          minuto: dto.minuto,
          detalle: `asiste_a_${evento.id}`,
        },
      });
    }

    // Si es una tarjeta amarilla, verificar si es la segunda en este partido para este jugador
    if (dto.tipo === TipoEvento.TARJETA_AMARILLA && dto.jugadorId) {
      const yellowCardsCount = await this.prisma.eventoPartido.count({
        where: {
          partidoId,
          jugadorId: dto.jugadorId,
          tipo: TipoEvento.TARJETA_AMARILLA,
        },
      });
      if (yellowCardsCount >= 2) {
        await this.prisma.eventoPartido.create({
          data: {
            partidoId,
            tipo: TipoEvento.TARJETA_ROJA,
            equipoId: dto.equipoId,
            jugadorId: dto.jugadorId,
            minuto: dto.minuto,
            detalle: 'Segunda tarjeta amarilla',
          },
        });
      }
    }

    // Recalcular estado de la tanda de penales si corresponde
    if (isPenal) {
      await this.updatePenaltyShootoutState(partidoId);
    }

    this.logger.log(`Evento ${dto.tipo} añadido al partido ${partidoId}`);
    return evento;
  }

  async deleteEvent(partidoId: string, eventId: string, userId: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
    });
    if (!partido) throw new NotFoundException('Partido no encontrado');
    await this.checkOrganizadorOStaff(partido.torneoId, userId);

    // No se permiten eliminar eventos en partidos finalizados
    if (partido.faseJuego === FaseJuego.FINALIZADO) {
      throw new BadRequestException('No se pueden eliminar eventos en un partido finalizado');
    }

    const evento = await this.prisma.eventoPartido.findUnique({
      where: { id: eventId },
    });
    if (!evento) throw new NotFoundException('Evento no encontrado');

    if (evento.tipo === TipoEvento.TARJETA_AMARILLA && evento.jugadorId) {
      const automaticRedCard = await this.prisma.eventoPartido.findFirst({
        where: {
          partidoId,
          jugadorId: evento.jugadorId,
          tipo: TipoEvento.TARJETA_ROJA,
          detalle: 'Segunda tarjeta amarilla',
        },
      });
      if (automaticRedCard) {
        throw new BadRequestException(
          'No se puede eliminar una tarjeta amarilla si el jugador tiene una tarjeta roja automática por doble amarilla. Elimina la tarjeta roja primero.',
        );
      }
    }

    await this.prisma.eventoPartido.delete({ where: { id: eventId } });

    // Si se elimina una tarjeta roja de doble amarilla, eliminar una tarjeta amarilla automática
    if (evento.tipo === TipoEvento.TARJETA_ROJA && evento.jugadorId && evento.detalle === 'Segunda tarjeta amarilla') {
      const lastYellowCard = await this.prisma.eventoPartido.findFirst({
        where: {
          partidoId,
          jugadorId: evento.jugadorId,
          tipo: TipoEvento.TARJETA_AMARILLA,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (lastYellowCard) {
        await this.prisma.eventoPartido.delete({ where: { id: lastYellowCard.id } });
      }
    }

    // Revertir gol si fue GOL y no penal
    if (evento.tipo === TipoEvento.GOL) {
      const isPenalEvent = partido.faseJuego === FaseJuego.PENALES || evento.detalle === 'PENAL';
      if (!isPenalEvent) {
        if (evento.equipoId === partido.equipoLocalId) {
          await this.prisma.partido.update({
            where: { id: partidoId },
            data: { golesLocal: { decrement: 1 } },
          });
        } else if (evento.equipoId === partido.equipoVisitanteId) {
          await this.prisma.partido.update({
            where: { id: partidoId },
            data: { golesVisitante: { decrement: 1 } },
          });
        }
      }

      // Eliminar asistencia asociada en cascada
      const assistEvent = await this.prisma.eventoPartido.findFirst({
        where: {
          partidoId,
          tipo: TipoEvento.ASISTENCIA,
          detalle: `asiste_a_${eventId}`,
        },
      });
      if (assistEvent) {
        await this.prisma.eventoPartido.delete({ where: { id: assistEvent.id } });
      }
    }

    // Si se elimina una tarjeta amarilla, eliminar la roja automática de doble amarilla si existía
    if (evento.tipo === TipoEvento.TARJETA_AMARILLA && evento.jugadorId) {
      const redCard = await this.prisma.eventoPartido.findFirst({
        where: {
          partidoId,
          jugadorId: evento.jugadorId,
          tipo: TipoEvento.TARJETA_ROJA,
          detalle: 'Segunda tarjeta amarilla',
        },
      });
      if (redCard) {
        await this.prisma.eventoPartido.delete({ where: { id: redCard.id } });
      }
    }

    const isPenal = partido.faseJuego === FaseJuego.PENALES || evento.detalle === 'PENAL' || evento.tipo === TipoEvento.PENAL_FALLADO;
    if (isPenal) {
      await this.updatePenaltyShootoutState(partidoId);
    }

    this.logger.log(`Evento ${eventId} eliminado del partido ${partidoId}`);
    return { mensaje: 'Evento eliminado' };
  }

  private async getStandingsWinner(torneoId: string): Promise<{ nombre: string; escudo: string | null } | null> {
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { torneoId, estado: 'APROBADA' },
      include: { equipo: { select: { id: true, nombre: true, escudo: true } } },
    });
    const equipos = inscripciones.map((i) => i.equipo);
    if (equipos.length === 0) return null;

    const ptsMap = new Map<string, number>();
    const dgMap = new Map<string, number>();
    const gfMap = new Map<string, number>();
    for (const eq of equipos) {
      ptsMap.set(eq.id, 0);
      dgMap.set(eq.id, 0);
      gfMap.set(eq.id, 0);
    }

    const partidos = await this.prisma.partido.findMany({
      where: {
        torneoId,
        faseJuego: FaseJuego.FINALIZADO,
        golesLocal: { not: null },
        golesVisitante: { not: null },
      },
    });

    for (const p of partidos) {
      const gl = p.golesLocal ?? 0;
      const gv = p.golesVisitante ?? 0;

      // Local
      gfMap.set(p.equipoLocalId, (gfMap.get(p.equipoLocalId) ?? 0) + gl);
      dgMap.set(p.equipoLocalId, (dgMap.get(p.equipoLocalId) ?? 0) + (gl - gv));

      // Visitante
      gfMap.set(p.equipoVisitanteId, (gfMap.get(p.equipoVisitanteId) ?? 0) + gv);
      dgMap.set(p.equipoVisitanteId, (dgMap.get(p.equipoVisitanteId) ?? 0) + (gv - gl));

      if (gl > gv) {
        ptsMap.set(p.equipoLocalId, (ptsMap.get(p.equipoLocalId) ?? 0) + 3);
      } else if (gv > gl) {
        ptsMap.set(p.equipoVisitanteId, (ptsMap.get(p.equipoVisitanteId) ?? 0) + 3);
      } else {
        ptsMap.set(p.equipoLocalId, (ptsMap.get(p.equipoLocalId) ?? 0) + 1);
        ptsMap.set(p.equipoVisitanteId, (ptsMap.get(p.equipoVisitanteId) ?? 0) + 1);
      }
    }

    const sorted = [...equipos].sort((a, b) => {
      const ptsA = ptsMap.get(a.id) ?? 0;
      const ptsB = ptsMap.get(b.id) ?? 0;
      if (ptsB !== ptsA) return ptsB - ptsA;

      const dgA = dgMap.get(a.id) ?? 0;
      const dgB = dgMap.get(b.id) ?? 0;
      if (dgB !== dgA) return dgB - dgA;

      const gfA = gfMap.get(a.id) ?? 0;
      const gfB = gfMap.get(b.id) ?? 0;
      return gfB - gfA;
    });

    return sorted[0] ? { nombre: sorted[0].nombre, escudo: sorted[0].escudo } : null;
  }

  private getCampoBufferMs(modalidad: string): number {
    const diffMinutes = modalidad === 'FUTBOL_11' ? 120 : 75;
    return diffMinutes * 60 * 1000;
  }

  private partidoCampoHorarioConflicto(
    targetMs: number,
    otro: {
      fecha: Date;
      faseJuego: FaseJuego;
      estado: EstadoPartido;
      finalizadoEn: Date | null;
    },
    bufferMs: number,
  ): boolean {
    const otherStart = otro.fecha.getTime();

    if (otro.faseJuego === FaseJuego.FINALIZADO) {
      const ended = otro.finalizadoEn
        ? otro.finalizadoEn.getTime()
        : otherStart;
      return targetMs < ended + bufferMs;
    }

    if (otro.estado === EstadoPartido.EN_CURSO) {
      return targetMs < Date.now() + bufferMs;
    }

    return Math.abs(targetMs - otherStart) < bufferMs;
  }

  private async assertNoCampoConflict(
    torneoId: string,
    excludePartidoId: string,
    campoId: string,
    targetFecha: Date,
    modalidad: string,
  ): Promise<void> {
    const bufferMs = this.getCampoBufferMs(modalidad);
    const targetMs = targetFecha.getTime();

    const otros = await this.prisma.partido.findMany({
      where: {
        torneoId,
        id: { not: excludePartidoId },
        campoId,
        fecha: { not: null },
      },
      select: {
        id: true,
        fecha: true,
        faseJuego: true,
        estado: true,
        finalizadoEn: true,
      },
    });

    for (const otro of otros) {
      if (!otro.fecha) continue;
      if (this.partidoCampoHorarioConflicto(targetMs, { ...otro, fecha: otro.fecha }, bufferMs)) {
        const hoursText = modalidad === 'FUTBOL_11' ? '2 horas' : '1 hora y 15 minutos';
        throw new BadRequestException(
          `Ya hay un partido en esta cancha con menos de ${hoursText} de diferencia entre horarios de inicio.`,
        );
      }
    }
  }

  /** Partido de copa con resultado definido (alineado con el frontend). */
  private isCopaMatchFinished(partido: {
    faseJuego: FaseJuego;
    golesLocal: number | null;
    golesVisitante: number | null;
    golesPenalesLocal: number | null;
    golesPenalesVisitante: number | null;
    estado: EstadoPartido;
  }): boolean {
    if (partido.faseJuego === FaseJuego.FINALIZADO) return true;
    if (
      partido.faseJuego === FaseJuego.PENALES &&
      partido.golesPenalesLocal !== null &&
      partido.golesPenalesVisitante !== null
    ) {
      return true;
    }
    return false;
  }

  private getCopaWinnerId(partido: {
    golesLocal: number | null;
    golesVisitante: number | null;
    golesPenalesLocal: number | null;
    golesPenalesVisitante: number | null;
    equipoLocalId: string;
    equipoVisitanteId: string;
  }): string | null {
    if (partido.golesLocal === null || partido.golesVisitante === null) {
      return null;
    }
    
    const gl = partido.golesLocal;
    const gv = partido.golesVisitante;
    if (gl > gv) return partido.equipoLocalId;
    if (gv > gl) return partido.equipoVisitanteId;
    
    if (
      partido.golesPenalesLocal !== null &&
      partido.golesPenalesVisitante !== null
    ) {
      const penL = partido.golesPenalesLocal;
      const penV = partido.golesPenalesVisitante;
      return penL > penV ? partido.equipoLocalId : partido.equipoVisitanteId;
    }
    
    return null;
  }

  private getCopaFaseLabel(matchesInRoundCount: number): string {
    if (matchesInRoundCount === 2) return 'Final';
    if (matchesInRoundCount === 4) return 'Semifinal';
    if (matchesInRoundCount === 8) return 'Cuartos de final';
    return `Ronda de ${matchesInRoundCount}`;
  }

  async syncCopaBracket(torneoId: string): Promise<void> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { formato: true },
    });
    if (
      !torneo ||
      (torneo.formato !== FormatoTorneo.COPA &&
        torneo.formato !== FormatoTorneo.ELIMINATORIA)
    ) {
      return;
    }

    const allMatches = await this.prisma.partido.findMany({
      where: { torneoId },
      orderBy: [{ ronda: 'asc' }, { createdAt: 'asc' }],
    });

    const byRound = new Map<number, typeof allMatches>();
    for (const m of allMatches) {
      const r = m.ronda ?? 1;
      if (!byRound.has(r)) byRound.set(r, []);
      byRound.get(r)!.push(m);
    }

    const roundNums = [...byRound.keys()].sort((a, b) => a - b);
    for (const ronda of roundNums) {
      const matchesInRound = byRound.get(ronda)!;
      for (let mIndex = 0; mIndex < matchesInRound.length; mIndex += 2) {
        const m1 = matchesInRound[mIndex];
        const m2 = matchesInRound[mIndex + 1];
        if (!m1 || !m2) continue;
        if (!this.isCopaMatchFinished(m1) || !this.isCopaMatchFinished(m2)) {
          continue;
        }

        const localWinnerId = this.getCopaWinnerId(m1);
        const visitanteWinnerId = this.getCopaWinnerId(m2);
        
        if (!localWinnerId || !visitanteWinnerId) {
          continue;
        }

        const isEven = mIndex % 2 === 0;
        const realLocalId = isEven ? localWinnerId : visitanteWinnerId;
        const realVisitanteId = isEven ? visitanteWinnerId : localWinnerId;

        const nextRound = ronda + 1;
        const nextMatchIndex = Math.floor(mIndex / 2);
        const nextFaseLabel = this.getCopaFaseLabel(matchesInRound.length);

        const matchesInNextRound = await this.prisma.partido.findMany({
          where: { torneoId, ronda: nextRound },
          orderBy: { createdAt: 'asc' },
        });

        if (matchesInNextRound.length > nextMatchIndex) {
          const existing = matchesInNextRound[nextMatchIndex];
          if (
            existing.equipoLocalId !== realLocalId ||
            existing.equipoVisitanteId !== realVisitanteId
          ) {
            await this.prisma.partido.update({
              where: { id: existing.id },
              data: {
                equipoLocalId: realLocalId,
                equipoVisitanteId: realVisitanteId,
              },
            });
          }
        } else {
          await this.prisma.partido.create({
            data: {
              torneoId,
              ronda: nextRound,
              fase: nextFaseLabel,
              equipoLocalId: realLocalId,
              equipoVisitanteId: realVisitanteId,
              estado: EstadoPartido.PENDIENTE,
              faseJuego: FaseJuego.PREVIA,
            },
          });
        }
      }
    }
  }

  async getAvailablePlayers(partidoId: string, equipoId: string): Promise<string[]> {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      select: { torneoId: true },
    });
    if (!partido) return [];

    const inscripcion = await this.prisma.inscripcion.findFirst({
      where: {
        torneoId: partido.torneoId,
        equipoId: equipoId,
        estado: 'APROBADA',
      },
      include: {
        roster: {
          select: { usuarioId: true },
        },
      },
    });

    if (inscripcion && inscripcion.roster.length > 0) {
      return inscripcion.roster.map(r => r.usuarioId);
    }

    const teamPlayers = await this.prisma.usuarioEquipo.findMany({
      where: { equipoId: equipoId },
      select: { usuarioId: true },
    });
    return teamPlayers.map(tp => tp.usuarioId);
  }

  async getEligiblePlayers(partidoId: string, equipoId: string): Promise<string[]> {
    const available = await this.getAvailablePlayers(partidoId, equipoId);

    const redCards = await this.prisma.eventoPartido.findMany({
      where: {
        partidoId,
        equipoId,
        tipo: TipoEvento.TARJETA_ROJA,
        jugadorId: { not: null },
      },
      select: { jugadorId: true },
    });
    const expelledIds = new Set(redCards.map(rc => rc.jugadorId!));

    return available.filter(id => !expelledIds.has(id));
  }

  async handleMatchEndActions(partidoId: string, updated: any) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      include: { torneo: true },
    });
    if (!partido) return null;

    const torneo = partido.torneo;
    if (
      torneo &&
      (torneo.formato === FormatoTorneo.COPA ||
        torneo.formato === FormatoTorneo.ELIMINATORIA)
    ) {
      try {
        await this.syncCopaBracket(partido.torneoId);
      } catch (err) {
        this.logger.error(`Error al avanzar ganador en copa: ${(err as Error).message}`);
      }
    }

    let ganadorTorneo: any = null;
    if (torneo) {
      if (torneo.formato === FormatoTorneo.LIGA) {
        const pendingMatchesCount = await this.prisma.partido.count({
          where: {
            torneoId: partido.torneoId,
            id: { not: partido.id },
            faseJuego: { not: FaseJuego.FINALIZADO },
          },
        });
        if (pendingMatchesCount === 0) {
          await this.prisma.torneo.update({
            where: { id: partido.torneoId },
            data: { estado: 'FINALIZADO' },
          });
          ganadorTorneo = await this.getStandingsWinner(partido.torneoId);
        }
      } else {
        if (partido.fase === 'Final') {
          await this.prisma.torneo.update({
            where: { id: partido.torneoId },
            data: { estado: 'FINALIZADO' },
          });
          const currentGolesLocal = updated.golesLocal ?? 0;
          const currentGolesVisitante = updated.golesVisitante ?? 0;
          let winnerId: string;
          if (currentGolesLocal > currentGolesVisitante) {
            winnerId = updated.equipoLocalId;
          } else if (currentGolesVisitante > currentGolesLocal) {
            winnerId = updated.equipoVisitanteId;
          } else {
            const penLocal = updated.golesPenalesLocal ?? 0;
            const penVis = updated.golesPenalesVisitante ?? 0;
            winnerId = penLocal >= penVis ? updated.equipoLocalId : updated.equipoVisitanteId;
          }
          ganadorTorneo = await this.prisma.equipo.findUnique({
            where: { id: winnerId },
            select: { nombre: true, escudo: true },
          });
        }
      }
    }
    return ganadorTorneo;
  }

  async updatePenaltyShootoutState(partidoId: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      include: { torneo: true },
    });
    if (!partido) return;

    const events = await this.prisma.eventoPartido.findMany({
      where: {
        partidoId,
        OR: [
          { tipo: TipoEvento.PENAL_FALLADO },
          { tipo: TipoEvento.GOL, detalle: 'PENAL' },
          {
            partido: { faseJuego: FaseJuego.PENALES }
          }
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    const penaltyEvents = events.filter(ev => 
      ev.detalle === 'PENAL' || 
      ev.tipo === TipoEvento.PENAL_FALLADO ||
      ev.minuto === null || 
      ev.minuto === undefined
    );

    const localShots = penaltyEvents.filter(ev => ev.equipoId === partido.equipoLocalId);
    const visitanteShots = penaltyEvents.filter(ev => ev.equipoId === partido.equipoVisitanteId);

    const kicksLocal = localShots.length;
    const kicksVisitante = visitanteShots.length;
    const golesLocal = localShots.filter(ev => ev.tipo === TipoEvento.GOL).length;
    const golesVisitante = visitanteShots.filter(ev => ev.tipo === TipoEvento.GOL).length;

    let finished = false;
    let winnerId: string | null = null;

    if (kicksLocal <= 5 && kicksVisitante <= 5) {
      const remLocal = 5 - kicksLocal;
      const remVisitante = 5 - kicksVisitante;
      const maxLocal = golesLocal + remLocal;
      const maxVisitante = golesVisitante + remVisitante;

      if (golesLocal > maxVisitante) {
        finished = true;
        winnerId = partido.equipoLocalId;
      } else if (golesVisitante > maxLocal) {
        finished = true;
        winnerId = partido.equipoVisitanteId;
      } else if (kicksLocal === 5 && kicksVisitante === 5) {
        if (golesLocal !== golesVisitante) {
          finished = true;
          winnerId = golesLocal > golesVisitante ? partido.equipoLocalId : partido.equipoVisitanteId;
        }
      }
    } else {
      if (kicksLocal === kicksVisitante) {
        if (golesLocal !== golesVisitante) {
          finished = true;
          winnerId = golesLocal > golesVisitante ? partido.equipoLocalId : partido.equipoVisitanteId;
        }
      }
    }

    if (finished) {
      const now = new Date();
      const updated = await this.prisma.partido.update({
        where: { id: partidoId },
        data: {
          faseJuego: FaseJuego.FINALIZADO,
          finalizadoEn: now,
          estado: partido.torneo.formato === FormatoTorneo.LIGA
            ? EstadoPartido.CONFIRMADO
            : EstadoPartido.EN_DISPUTA,
          golesPenalesLocal: golesLocal,
          golesPenalesVisitante: golesVisitante,
        },
      });
      await this.handleMatchEndActions(partidoId, updated);
    } else {
      if (partido.faseJuego === FaseJuego.FINALIZADO) {
        await this.prisma.partido.update({
          where: { id: partidoId },
          data: {
            faseJuego: FaseJuego.PENALES,
            finalizadoEn: null,
            estado: EstadoPartido.EN_CURSO,
            golesPenalesLocal: golesLocal,
            golesPenalesVisitante: golesVisitante,
          },
        });
      } else {
        await this.prisma.partido.update({
          where: { id: partidoId },
          data: {
            golesPenalesLocal: golesLocal,
            golesPenalesVisitante: golesVisitante,
          },
        });
      }
    }
  }
}
