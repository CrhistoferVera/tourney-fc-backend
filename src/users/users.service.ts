import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        email: true,
        fotoPerfil: true,
        zona: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findById(id: string) {
    const user = await this.prisma.usuario.findUnique({
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

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async updateMe(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const updated = await this.prisma.usuario.update({
      where: { id: userId },
      data: updateUserDto,
      select: {
        id: true,
        nombre: true,
        email: true,
        fotoPerfil: true,
        zona: true,
        updatedAt: true,
      },
    });

    this.logger.log(`Perfil actualizado: ${userId}`);
    return updated;
  }

  async deleteMe(userId: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.usuario.delete({ where: { id: userId } });
    this.logger.log(`Usuario eliminado: ${userId}`);

    return { mensaje: 'Cuenta eliminada exitosamente' };
  }
}