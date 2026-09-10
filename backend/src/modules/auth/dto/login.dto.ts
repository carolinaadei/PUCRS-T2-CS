import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/** RF02 - login de usuario. */
export class LoginDto {
  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  @IsNotEmpty()
  senha!: string;
}
