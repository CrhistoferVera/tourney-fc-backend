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

      await expect(service.findMe('uuid-inexistente')).rejects.toThrow(NotFoundException);
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

      const result = await service.updateMe('uuid-1', { nombre: 'Juan Actualizado', zona: 'La Paz' });

      expect(result.nombre).toBe('Juan Actualizado');
      expect(result.zona).toBe('La Paz');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(service.updateMe('uuid-inexistente', { nombre: 'Test' }))
        .rejects.toThrow(NotFoundException);
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

      await expect(service.deleteMe('uuid-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});