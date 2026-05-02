import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockPrismaService = {
  usuario: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  usuarioTorneo: {
    findMany: jest.fn(),
  },
  usuarioEquipo: {
    findMany: jest.fn(),
  },
  partido: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  const mockUser = {
    id: 'uuid-1',
    nombre: 'Juan Perez',
    email: 'juan@example.com',
    fotoPerfil: null,
    zona: 'Cochabamba',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // ─── HU-3: Editar perfil ──────────────────────────────────────

  describe('findMe', () => {
    it('HU-3 criterio 1: retorna datos del usuario autenticado', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUser);

      const result = await service.findMe('uuid-1');

      expect(result.id).toBe('uuid-1');
      expect(result.email).toBe('juan@example.com');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(service.findMe('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateMe', () => {
    it('HU-3 criterio 11: actualiza datos en la BD correctamente', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.usuario.update.mockResolvedValue({
        ...mockUser,
        nombre: 'Juan Actualizado',
        zona: 'La Paz',
      });

      const result = await service.updateMe('uuid-1', {
        nombre: 'Juan Actualizado',
        zona: 'La Paz',
      });

      expect(result.nombre).toBe('Juan Actualizado');
      expect(result.zona).toBe('La Paz');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMe('uuid-inexistente', { nombre: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMe', () => {
    it('elimina la cuenta y retorna mensaje de confirmación', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.usuario.delete.mockResolvedValue(mockUser);

      const result = await service.deleteMe('uuid-1');

      expect(result.mensaje).toBe('Cuenta eliminada exitosamente');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(service.deleteMe('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getDashboard', () => {
    it('HU-4: retorna estructura completa del dashboard', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue({ id: 'uuid-1' });
      mockPrismaService.usuarioTorneo = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockPrismaService.usuarioEquipo = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockPrismaService.partido = {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getDashboard('uuid-1');

      expect(result).toHaveProperty('torneos');
      expect(result).toHaveProperty('proximoPartido');
      expect(result).toHaveProperty('ultimosResultados');
    });

    it('HU-4 criterio 1: usuario sin torneos retorna lista vacía', async () => {
      mockPrismaService.usuarioTorneo = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockPrismaService.usuarioEquipo = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockPrismaService.partido = {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getDashboard('uuid-1');

      expect(result.torneos).toEqual([]);
      expect(result.proximoPartido).toBeNull();
      expect(result.ultimosResultados).toEqual([]);
    });

    it('HU-4 criterio 2: retorna torneos con información asociada', async () => {
      mockPrismaService.usuarioTorneo = {
        findMany: jest.fn().mockResolvedValue([
          {
            rol: 'JUGADOR',
            torneo: {
              id: 'torneo-1',
              nombre: 'Copa Universitaria',
              formato: 'LIGA',
              estado: 'EN_CURSO',
              equipos: [{ jugadores: [] }, { jugadores: [] }],
            },
          },
        ]),
      };
      mockPrismaService.usuarioEquipo = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockPrismaService.partido = {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getDashboard('uuid-1');

      expect(result.torneos).toHaveLength(1);
      expect(result.torneos[0].nombre).toBe('Copa Universitaria');
      expect(result.torneos[0].rol).toBe('JUGADOR');
      expect(result.torneos[0].cantidadEquipos).toBe(2);
    });

    it('HU-4 criterio 4: retorna próximo partido con detalle', async () => {
      mockPrismaService.usuarioTorneo = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockPrismaService.usuarioEquipo = {
        findMany: jest.fn().mockResolvedValue([{ equipoId: 'equipo-1' }]),
      };
      mockPrismaService.partido = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'partido-1',
          fecha: new Date('2026-05-01T15:00:00Z'),
          equipoLocal: { nombre: 'Equipo A' },
          equipoVisitante: { nombre: 'Equipo B' },
          campo: { nombre: 'Cancha Central', direccion: 'Av. Principal 123' },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getDashboard('uuid-1');

      expect(result.proximoPartido).not.toBeNull();
      expect(result.proximoPartido?.equipoLocal).toBe('Equipo A');
      expect(result.proximoPartido?.equipoVisitante).toBe('Equipo B');
      expect(result.proximoPartido?.lugar).toBe('Cancha Central');
    });

    it('HU-4 criterio 5: retorna últimos resultados confirmados', async () => {
      mockPrismaService.usuarioTorneo = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockPrismaService.usuarioEquipo = {
        findMany: jest.fn().mockResolvedValue([{ equipoId: 'equipo-1' }]),
      };
      mockPrismaService.partido = {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'partido-1',
            equipoLocal: { nombre: 'Equipo A' },
            equipoVisitante: { nombre: 'Equipo B' },
            golesLocal: 2,
            golesVisitante: 1,
            fecha: new Date('2026-04-20T15:00:00Z'),
            campo: { nombre: 'Cancha Central' },
            estado: 'CONFIRMADO',
          },
        ]),
      };

      const result = await service.getDashboard('uuid-1');

      expect(result.ultimosResultados).toHaveLength(1);
      expect(result.ultimosResultados[0].golesLocal).toBe(2);
      expect(result.ultimosResultados[0].estadoConfirmacion).toBe('CONFIRMADO');
    });
  });
});
