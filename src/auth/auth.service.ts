import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService) {}

  async register(username: string, password: string) {
    const existing = await this.users.findByUsername(username);
    if (existing) throw new UnauthorizedException('Username taken');
    const user = await this.users.create(username, password);
    return this.sign(user.id, user.username);
  }

  async login(username: string, password: string) {
    const user = await this.users.validate(username, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.sign(user.id, user.username);
  }

  private sign(id: string, username: string) {
    const token = this.jwt.sign({ sub: id, username });
    return { token, user: { id, username } };
  }
}
