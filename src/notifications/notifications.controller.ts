import { Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/notificaciones')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones de bandeja del usuario autenticado' })
  findMine(@Request() req: { user: { id: string } }) {
    return this.notificationsService.findByUser(req.user.id);
  }

  @Patch(':id/leida')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  markRead(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.id, id);
  }
}
