import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Usado em POST /auth/refresh e POST /auth/logout. */
export class RefreshTokenDto {
  @ApiProperty({ example: 'q0B9wPZx3cGkO6m7Zt6Hn0a5pQ2y8V1uR4sE7dF9gJk' })
  @IsString({ message: 'O refreshToken deve ser um texto' })
  @IsNotEmpty({ message: 'Informe o refreshToken' })
  @MaxLength(200, { message: 'O refreshToken deve ter no maximo 200 caracteres' })
  refreshToken!: string;
}
