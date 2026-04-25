import { Controller, Get, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Request() req: any) {
    return this.usersService.findMe(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Request() req: any, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.updateMe(req.user.id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  deleteMe(@Request() req: any) {
    return this.usersService.deleteMe(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}