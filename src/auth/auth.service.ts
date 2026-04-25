import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    this.logger.log(`Intentando registrar usuario: ${registerDto.email}`);

    const existingUser = await this.prisma.usuario.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Este correo electrónico ya está registrado. Por favor, inicie sesión');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(registerDto.password, salt);

    const user = await this.prisma.usuario.create({
      data: {
        nombre: registerDto.nombre,
        email: registerDto.email,
        passwordHash,
        zona: registerDto.zona || null,
      },
    });

    this.logger.log(`Usuario registrado exitosamente: ${user.email}`);

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

    const user = await this.prisma.usuario.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Correo electrónico o contraseña incorrectos. Por favor, intente nuevamente');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Correo electrónico o contraseña incorrectos. Por favor, intente nuevamente');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    this.logger.log(`Login exitoso: ${user.email}`);

    return {
      accessToken: token,
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      fotoPerfil: user.fotoPerfil,
      zona: user.zona,
      mensaje: 'Login exitoso',
    };
  }
}