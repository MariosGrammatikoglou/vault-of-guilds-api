import { IsString, IsUUID, IsIn } from 'class-validator';
export class CreateChannelDto {
  @IsUUID() serverId!: string;
  @IsString() name!: string;
  @IsIn(['text','voice']) type!: 'text'|'voice';
}
