import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  async me(@Req() req: any) {
    return this.users.findById(req.user.sub);
  }

  @Patch('me/color')
  async updateColor(
    @Req() req: any,
    @Body() body: { color?: string | null },
  ) {
    const raw = body.color ?? null;
    const color =
      raw && raw.trim().length > 0
        ? raw.trim()
        : null;
    return this.users.updateDisplayColor(req.user.sub, color);
  }
}
