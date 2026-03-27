import { IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString() @Matches(/^[a-zA-Z0-9_]{3,20}$/)
  username!: string;

  @IsString() @MinLength(6)
  password!: string;
}

export class LoginDto {
  @IsString() username!: string;
  @IsString() password!: string;
}
