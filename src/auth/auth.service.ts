import { Injectable, ConflictException, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly resend: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

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

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    // Por seguridad siempre respondemos lo mismo aunque no exista el usuario
    if (!user) {
      return { mensaje: 'Si el correo está registrado, recibirás un código de verificación' };
    }

    // Invalidar códigos anteriores del mismo email
    await this.prisma.resetPassword.updateMany({
      where: { email: dto.email, usado: false },
      data: { usado: true },
    });

    // Generar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    await this.prisma.resetPassword.create({
      data: { email: dto.email, codigo, expiresAt },
    });

    // Enviar correo
    await this.resend.emails.send({
      from: this.configService.get<string>('RESEND_FROM')!,
      to: dto.email,
      subject: 'Código de verificación - TourneyFC',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0D7A3E;">TourneyFC</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p>Tu código de verificación es:</p>
          <div style="background: #EBF0EC; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0D7A3E;">${codigo}</span>
          </div>
          <p style="color: #3D4F44; font-size: 14px;">Este código expira en <strong>5 minutos</strong>.</p>
          <p style="color: #3D4F44; font-size: 14px;">Si no solicitaste este cambio, ignora este correo.</p>
        </div>
      `,
    });

    this.logger.log(`Código de recuperación enviado a: ${dto.email}`);
    return { mensaje: 'Si el correo está registrado, recibirás un código de verificación' };
  }

  async verifyCode(dto: VerifyCodeDto) {
    const reset = await this.prisma.resetPassword.findFirst({
      where: {
        email: dto.email,
        codigo: dto.codigo,
        usado: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!reset) {
      throw new BadRequestException('Código inválido o expirado');
    }

    return { valido: true, mensaje: 'Código verificado correctamente' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const reset = await this.prisma.resetPassword.findFirst({
      where: {
        email: dto.email,
        codigo: dto.codigo,
        usado: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!reset) {
      throw new BadRequestException('Código inválido o expirado');
    }

    const user = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.nuevaPassword, salt);

    await this.prisma.usuario.update({
      where: { email: dto.email },
      data: { passwordHash },
    });

    // Marcar código como usado
    await this.prisma.resetPassword.update({
      where: { id: reset.id },
      data: { usado: true },
    });

    this.logger.log(`Contraseña restablecida para: ${dto.email}`);
    return { mensaje: 'Contraseña restablecida exitosamente' };
  }
}