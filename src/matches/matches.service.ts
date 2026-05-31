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
import { EstadoPartido, RolTorneo, FaseJuego, TipoEvento, FormatoTorneo } from '@prisma/client';

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
          select: { id: true, nombre: true, fechaInicio: true, fechaFin: true },
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
    return partido;
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

    // Si está FINALIZADO, solo se permite editar dentro de los 3 minutos de gracia
    if (partido.faseJuego === FaseJuego.FINALIZADO) {
      const finishedAt = partido.finalizadoEn ? new Date(partido.finalizadoEn) : new Date(partido.updatedAt);
      const threeMinutesMs = 3 * 60 * 1000;
      if (new Date().getTime() - finishedAt.getTime() > threeMinutesMs) {
        throw new BadRequestException('No se puede editar un partido finalizado después del límite de corrección (3 minutos)');
      }
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
      const isFutbol11 = partido.torneo.modalidad === 'FUTBOL_11';
      const diffMinutes = isFutbol11 ? 120 : 75;
      const diffMs = diffMinutes * 60 * 1000;

      const minFecha = new Date(targetFecha.getTime() - diffMs);
      const maxFecha = new Date(targetFecha.getTime() + diffMs);

      const conflict = await this.prisma.partido.findFirst({
        where: {
          id: { not: partidoId },
          campoId: targetCampoId,
          fecha: {
            gt: minFecha,
            lt: maxFecha,
          },
        },
      });
      if (conflict) {
        const hoursText = isFutbol11 ? '2 horas' : '1 hora y 15 minutos';
        throw new BadRequestException(`Ya hay un partido programado en esta cancha con menos de ${hoursText} de diferencia.`);
      }
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

    const updated = await this.prisma.partido.update({
      where: { id: partidoId },
      data: {
        ...(dto.estado && { estado: dto.estado }),
        ...(dto.fecha && { fecha: new Date(dto.fecha) }),
        ...(dto.campoId !== undefined && { campoId: dto.campoId }),
        // Cambiar automáticamente PENDIENTE a CONFIRMADO al programar fecha/cancha
        ...((dto.fecha || dto.campoId) && partido.estado === EstadoPartido.PENDIENTE && { estado: EstadoPartido.CONFIRMADO }),
      },
      include: {
        equipoLocal: { select: { id: true, nombre: true } },
        equipoVisitante: { select: { id: true, nombre: true } },
        campo: { select: { id: true, nombre: true } },
      },
    });

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

      if (isCopa && isEmpate && partido.faseJuego === FaseJuego.SEGUNDO_TIEMPO) {
        // Empate en tiempo regular en torneo Copa: no finaliza el partido, se pausa en SEGUNDO_TIEMPO esperando penales
        data.faseJuego = FaseJuego.SEGUNDO_TIEMPO;
        data.estado = EstadoPartido.EN_CURSO;
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
    if (dto.action === MatchControlAction.END_MATCH) {
      try {
        const torneo = partido.torneo;
        if (torneo && (torneo.formato === FormatoTorneo.COPA || torneo.formato === FormatoTorneo.ELIMINATORIA)) {
          const currentRonda = partido.ronda || 1;
          const matchesInRound = await this.prisma.partido.findMany({
            where: { torneoId: partido.torneoId, ronda: currentRonda },
            orderBy: { createdAt: 'asc' },
          });

          const mIndex = matchesInRound.findIndex((m) => m.id === partidoId);
          if (mIndex !== -1) {
            const isEven = mIndex % 2 === 0;
            const partnerIndex = isEven ? mIndex + 1 : mIndex - 1;
            const partnerMatch = matchesInRound[partnerIndex];

            const currentGolesLocal = updated.golesLocal ?? 0;
            const currentGolesVisitante = updated.golesVisitante ?? 0;
            let currentWinnerId: string;
            if (currentGolesLocal > currentGolesVisitante) {
              currentWinnerId = updated.equipoLocalId;
            } else if (currentGolesVisitante > currentGolesLocal) {
              currentWinnerId = updated.equipoVisitanteId;
            } else {
              // Empate en copa: decidir por penales
              const penLocal = updated.golesPenalesLocal ?? 0;
              const penVis = updated.golesPenalesVisitante ?? 0;
              currentWinnerId = penLocal >= penVis ? updated.equipoLocalId : updated.equipoVisitanteId;
            }

            if (partnerMatch) {
              const partnerFinalized = partnerMatch.faseJuego === FaseJuego.FINALIZADO;
              if (partnerFinalized) {
                const partnerGolesLocal = partnerMatch.golesLocal ?? 0;
                const partnerGolesVisitante = partnerMatch.golesVisitante ?? 0;
                let partnerWinnerId: string;
                if (partnerGolesLocal > partnerGolesVisitante) {
                  partnerWinnerId = partnerMatch.equipoLocalId;
                } else if (partnerGolesVisitante > partnerGolesLocal) {
                  partnerWinnerId = partnerMatch.equipoVisitanteId;
                } else {
                  // Empate en copa: decidir por penales
                  const penLocal = partnerMatch.golesPenalesLocal ?? 0;
                  const penVis = partnerMatch.golesPenalesVisitante ?? 0;
                  partnerWinnerId = penLocal >= penVis ? partnerMatch.equipoLocalId : partnerMatch.equipoVisitanteId;
                }

                const nextRound = currentRonda + 1;
                const nextMatchIndex = Math.floor(mIndex / 2);

                const matchesInNextRound = await this.prisma.partido.findMany({
                  where: { torneoId: partido.torneoId, ronda: nextRound },
                  orderBy: { createdAt: 'asc' },
                });

                const localWinnerId = isEven ? currentWinnerId : partnerWinnerId;
                const visitanteWinnerId = isEven ? partnerWinnerId : currentWinnerId;

                const nextRoundTeamsCount = matchesInRound.length;
                const nextFaseLabel = nextRoundTeamsCount === 2 
                  ? 'Final' 
                  : nextRoundTeamsCount === 4 
                    ? 'Semifinal' 
                    : nextRoundTeamsCount === 8
                      ? 'Cuartos de final'
                      : `Ronda de ${nextRoundTeamsCount}`;

                if (matchesInNextRound.length > nextMatchIndex) {
                  const existingNextMatch = matchesInNextRound[nextMatchIndex];
                  await this.prisma.partido.update({
                    where: { id: existingNextMatch.id },
                    data: {
                      equipoLocalId: localWinnerId,
                      equipoVisitanteId: visitanteWinnerId,
                    },
                  });
                  this.logger.log(`Partido de siguiente ronda actualizado: ${existingNextMatch.id} (${localWinnerId} vs ${visitanteWinnerId})`);
                } else {
                  const newMatch = await this.prisma.partido.create({
                    data: {
                      torneoId: partido.torneoId,
                      ronda: nextRound,
                      fase: nextFaseLabel,
                      equipoLocalId: localWinnerId,
                      equipoVisitanteId: visitanteWinnerId,
                      estado: EstadoPartido.PENDIENTE,
                      faseJuego: FaseJuego.PREVIA,
                    },
                  });
                  this.logger.log(`Creado partido de siguiente ronda: ${newMatch.id} (${localWinnerId} vs ${visitanteWinnerId})`);
                }
              }
            }
          }
        }
      } catch (err) {
        this.logger.error(`Error al avanzar ganador en copa: ${err.message}`);
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

    // Validar que las tarjetas amarillas y rojas se asignen solo a jugadores
    if (
      (dto.tipo === TipoEvento.TARJETA_AMARILLA || dto.tipo === TipoEvento.TARJETA_ROJA) &&
      !dto.jugadorId
    ) {
      throw new BadRequestException('Las tarjetas amarillas y rojas deben ser asignadas a un jugador');
    }

    // Validar límite de 3 minutos para partidos finalizados
    if (partido.faseJuego === FaseJuego.FINALIZADO) {
      const finishedAt = partido.finalizadoEn ? new Date(partido.finalizadoEn) : new Date(partido.updatedAt);
      const threeMinutesMs = 3 * 60 * 1000;
      if (new Date().getTime() - finishedAt.getTime() > threeMinutesMs) {
        throw new BadRequestException(
          'No se pueden registrar eventos en un partido finalizado después del límite de corrección (3 minutos)',
        );
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

    // Actualizar goles si es GOL
    if (dto.tipo === TipoEvento.GOL) {
      const isPenal = partido.faseJuego === FaseJuego.PENALES || dto.detalle === 'PENAL';
      if (dto.equipoId === partido.equipoLocalId) {
        await this.prisma.partido.update({
          where: { id: partidoId },
          data: isPenal
            ? { golesPenalesLocal: { increment: 1 } }
            : { golesLocal: { increment: 1 } },
        });
      } else if (dto.equipoId === partido.equipoVisitanteId) {
        await this.prisma.partido.update({
          where: { id: partidoId },
          data: isPenal
            ? { golesPenalesVisitante: { increment: 1 } }
            : { golesVisitante: { increment: 1 } },
        });
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

    this.logger.log(`Evento ${dto.tipo} añadido al partido ${partidoId}`);
    return evento;
  }

  async deleteEvent(partidoId: string, eventId: string, userId: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
    });
    if (!partido) throw new NotFoundException('Partido no encontrado');
    await this.checkOrganizadorOStaff(partido.torneoId, userId);

    // Validar límite de 3 minutos para partidos finalizados
    if (partido.faseJuego === FaseJuego.FINALIZADO) {
      const finishedAt = partido.finalizadoEn ? new Date(partido.finalizadoEn) : new Date(partido.updatedAt);
      const threeMinutesMs = 3 * 60 * 1000;
      if (new Date().getTime() - finishedAt.getTime() > threeMinutesMs) {
        throw new BadRequestException(
          'No se pueden eliminar eventos en un partido finalizado después del límite de corrección (3 minutos)',
        );
      }
    }

    const evento = await this.prisma.eventoPartido.findUnique({
      where: { id: eventId },
    });
    if (!evento) throw new NotFoundException('Evento no encontrado');

    // Bloquear eliminación de tarjetas amarillas si el jugador tiene una roja automática
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

    // Revertir gol si fue GOL y eliminar asistencia si corresponde
    if (evento.tipo === TipoEvento.GOL) {
      const isPenal = partido.faseJuego === FaseJuego.PENALES || evento.detalle === 'PENAL';
      if (evento.equipoId === partido.equipoLocalId) {
        await this.prisma.partido.update({
          where: { id: partidoId },
          data: isPenal
            ? { golesPenalesLocal: { decrement: 1 } }
            : { golesLocal: { decrement: 1 } },
        });
      } else if (evento.equipoId === partido.equipoVisitanteId) {
        await this.prisma.partido.update({
          where: { id: partidoId },
          data: isPenal
            ? { golesPenalesVisitante: { decrement: 1 } }
            : { golesVisitante: { decrement: 1 } },
        });
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
}
