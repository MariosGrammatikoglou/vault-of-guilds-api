import { IsUUID, IsString, MaxLength, MinLength } from 'class-validator';
export class SendMessageDto {
  @IsUUID() channelId!: string;
  @IsString() @MinLength(1) @MaxLength(4000)
  content!: string;
}
