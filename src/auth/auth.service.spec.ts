import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockPrismaService = {
  usuario: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ─── HU-1: Registro ───────────────────────────────────────────

  describe('register', () => {
    const registerDto = {
      nombre: 'Juan Perez',
      email: 'juan@example.com',
      password: 'Password123',
      zona: 'Cochabamba',
    };

    it('HU-1 criterio 4: registro exitoso retorna datos del usuario', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);
      mockPrismaService.usuario.create.mockResolvedValue({
        id: 'uuid-1',
        nombre: 'Juan Perez',
        email: 'juan@example.com',
        fotoPerfil: null,
        zona: 'Cochabamba',
      });

      const result = await service.register(registerDto);

      expect(result.registrado).toBe(true);
      expect(result.email).toBe('juan@example.com');
      expect(result.mensaje).toBe('Registro exitoso');
    });

    it('HU-1 criterio 5: email duplicado lanza ConflictException', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue({ id: 'uuid-1' });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });

    it('HU-1 criterio 5: mensaje de error correcto para email duplicado', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue({ id: 'uuid-1' });

      await expect(service.register(registerDto)).rejects.toThrow(
        'Este correo electrónico ya está registrado. Por favor, inicie sesión',
      );
    });

    it('no retorna el passwordHash en la respuesta', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);
      mockPrismaService.usuario.create.mockResolvedValue({
        id: 'uuid-1',
        nombre: 'Juan Perez',
        email: 'juan@example.com',
        fotoPerfil: null,
        zona: 'Cochabamba',
      });

      const result = await service.register(registerDto);

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  // ─── HU-2: Login ──────────────────────────────────────────────

  describe('login', () => {
    const loginDto = {
      email: 'juan@example.com',
      password: 'Password123',
    };

    const mockUser = {
      id: 'uuid-1',
      nombre: 'Juan Perez',
      email: 'juan@example.com',
      passwordHash: '',
      fotoPerfil: null,
      zona: 'Cochabamba',
    };

    beforeEach(async () => {
      mockUser.passwordHash = await bcrypt.hash('Password123', 10);
    });

    it('HU-2 criterio 1: login exitoso retorna accessToken JWT', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBeDefined();
      expect(result.accessToken).toBe('mock-token');
    });

    it('HU-2 criterio 3: email no registrado lanza UnauthorizedException', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('HU-2 criterio 3: contraseña incorrecta lanza UnauthorizedException', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUser);

      await expect(service.login({ ...loginDto, password: 'WrongPass1' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('HU-2 criterio 3: mensaje de error correcto para credenciales inválidas', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        'Correo electrónico o contraseña incorrectos. Por favor, intente nuevamente',
      );
    });

    it('no retorna el passwordHash en la respuesta', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result).not.toHaveProperty('passwordHash');
    });
  });
});