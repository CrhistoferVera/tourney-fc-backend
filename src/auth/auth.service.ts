import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(registerDto: RegisterDto) {
    this.logger.log(`Intentando registrar usuario: ${registerDto.email}`);

    // Verificar si el email ya existe (HU-1 criterio 5)
    const existingUser = await this.prisma.usuario.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Este correo electrónico ya está registrado. Por favor, inicie sesión');
    }

    // Hashear contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(registerDto.password, salt);

    // Crear usuario según tu schema
    const user = await this.prisma.usuario.create({
      data: {
        nombre: registerDto.nombre,
        email: registerDto.email,
        passwordHash: passwordHash,
        zona: registerDto.zona || null,
        // fotoPerfil se puede agregar después con un endpoint aparte
      },
    });

    this.logger.log(`Usuario registrado exitosamente: ${user.email}`);

    // No devolver el passwordHash por seguridad
    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      fotoPerfil: user.fotoPerfil,
      zona: user.zona,
      registrado: true,
      mensaje: 'Registro exitoso',
    };
  }

  async login(loginDto: LoginDto) {
    this.logger.log(`Intento de login: ${loginDto.email}`);

    // Buscar usuario por email
    const user = await this.prisma.usuario.findUnique({
      where: { email: loginDto.email },
    });

    // HU-2 criterio 3: Credenciales incorrectas
    if (!user) {
      throw new UnauthorizedException('Correo electrónico o contraseña incorrectos. Por favor, intente nuevamente');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Correo electrónico o contraseña incorrectos. Por favor, intente nuevamente');
    }

    this.logger.log(`Login exitoso: ${user.email}`);

    // Por ahora sin JWT, solo devolvemos el usuario
    // Después agregarás: const token = this.jwtService.sign({ sub: user.id, email: user.email });
    
    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      fotoPerfil: user.fotoPerfil,
      zona: user.zona,
      mensaje: 'Login exitoso',
    };
  }

  // Método auxiliar para obtener usuario por ID (útil después para JWT)
  async findById(id: string) {
    return this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        email: true,
        fotoPerfil: true,
        zona: true,
        createdAt: true,
      },
    });
  }
}