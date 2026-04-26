import { IsUUID, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsUUID() channelId!: string;
  @IsString() @MinLength(1) @MaxLength(4000)
  content!: string;
}

export class EditMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  content!: string;
}

export class AddReactionDto {
  @IsString() @MinLength(1) @MaxLength(12)
  emoji!: string;
}
