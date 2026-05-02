import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserEntity } from './entities/user.entity';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({
    summary: 'Obtener perfil propio',
    description: 'Retorna los datos del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil del usuario',
    type: UserEntity,
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  getMe(@Request() req: any) {
    return this.usersService.findMe(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiOperation({
    summary: 'Actualizar perfil propio',
    description: 'Edita nombre, foto de perfil o zona del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil actualizado',
    type: UserEntity,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  updateMe(@Request() req: any, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.updateMe(req.user.id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @ApiOperation({
    summary: 'Eliminar cuenta propia',
    description: 'Elimina permanentemente la cuenta del usuario autenticado',
  })
  @ApiResponse({ status: 200, description: 'Cuenta eliminada exitosamente' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  deleteMe(@Request() req: any) {
    return this.usersService.deleteMe(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: 'Ver perfil de otro usuario',
    description: 'Retorna datos públicos de un usuario por su ID',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID del usuario',
    example: '52bcd51e-6d88-4f46-b442-b4e407d58b6a',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil del usuario',
    type: UserEntity,
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/dashboard')
  @ApiOperation({
    summary: 'Dashboard del usuario',
    description:
      'Retorna torneos en los que participa, próximo partido y últimos resultados (HU-4)',
  })
  @ApiResponse({ status: 200, description: 'Datos del dashboard' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  getDashboard(@Request() req: any) {
    return this.usersService.getDashboard(req.user.id);
  }
}
