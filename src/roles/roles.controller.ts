import { Body, Controller, Delete, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesService } from './roles.service';

@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get('list')
  list(@Query('serverId') serverId: string) {
    return this.roles.list(serverId);
  }

  @Get('of-user')
  rolesOfUser(@Query('serverId') serverId: string, @Query('userId') userId: string) {
    return this.roles.rolesOfUser(serverId, userId);
  }

  @Get('my-perms')
  async myPerms(@Req() req: { user: { sub: string } }, @Query('serverId') serverId: string) {
    const permissions = await this.roles.userPermsBitmask(serverId, req.user.sub);
    return { serverId, permissions };
  }

  @Post()
  create(
    @Req() req: { user: { sub: string } },
    @Body() body: { serverId: string; name: string; color: string; permissions: number },
  ) {
    return this.roles.create(body.serverId, body.name, body.color, body.permissions, req.user.sub);
  }

  @Put()
  update(
    @Req() req: { user: { sub: string } },
    @Body() patch: { roleId: string; name?: string; color?: string; permissions?: number; position?: number },
  ) {
    return this.roles.update(patch.roleId, patch, req.user.sub);
  }

  @Delete()
  remove(@Req() req: { user: { sub: string } }, @Query('roleId') roleId: string) {
    return this.roles.delete(roleId, req.user.sub);
  }

  @Post('assign')
  assign(
    @Req() req: { user: { sub: string } },
    @Body() body: { serverId: string; userId: string; roleId: string },
  ) {
    return this.roles.assign(body.serverId, body.userId, body.roleId, req.user.sub);
  }

  @Post('unassign')
  unassign(
    @Req() req: { user: { sub: string } },
    @Body() body: { serverId: string; userId: string; roleId: string },
  ) {
    return this.roles.unassign(body.serverId, body.userId, body.roleId, req.user.sub);
  }
}
