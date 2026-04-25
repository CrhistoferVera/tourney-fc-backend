import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterResponse, LoginResponse } from './entities/auth.entity';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registro de nuevo usuario', description: 'Crea una cuenta con correo y contraseña' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente', type: RegisterResponse })
  @ApiResponse({ status: 400, description: 'Datos inválidos (email mal formado, contraseña débil, campos vacíos)' })
  @ApiResponse({ status: 409, description: 'El correo electrónico ya está registrado' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicio de sesión', description: 'Autentica al usuario y retorna un token JWT válido por 24 horas' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login exitoso, retorna accessToken JWT', type: LoginResponse })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'Correo electrónico o contraseña incorrectos' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}