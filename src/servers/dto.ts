import { IsString, IsUUID } from 'class-validator';
export class CreateServerDto { @IsString() name!: string; }
export class JoinServerDto { @IsUUID() serverId!: string; }
