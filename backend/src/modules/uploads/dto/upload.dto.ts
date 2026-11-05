import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { TIPOS_DE_IMAGEM, TipoDeImagem } from '../../../aws/armazenamento.service';

/** Para que serve a foto; decide a pasta do arquivo no bucket. */
export const FINALIDADES_DE_UPLOAD = ['DESTINO', 'ATIVIDADE'] as const;
export type FinalidadeDeUpload = (typeof FINALIDADES_DE_UPLOAD)[number];

export class SolicitarUploadDto {
  @ApiProperty({ enum: FINALIDADES_DE_UPLOAD, example: 'DESTINO' })
  @IsIn(FINALIDADES_DE_UPLOAD, {
    message: `Finalidade invalida: use ${FINALIDADES_DE_UPLOAD.join(', ')}`,
  })
  finalidade!: FinalidadeDeUpload;

  @ApiProperty({ enum: Object.keys(TIPOS_DE_IMAGEM), example: 'image/jpeg' })
  @IsIn(Object.keys(TIPOS_DE_IMAGEM), {
    message: `Tipo de arquivo nao aceito: use ${Object.keys(TIPOS_DE_IMAGEM).join(', ')}`,
  })
  tipoConteudo!: TipoDeImagem;
}

export class UploadAutorizadoDto {
  @ApiProperty({
    example: 'http://localhost:4566/viajajunto-local-midia',
    description: 'Para onde o navegador envia o arquivo, num POST multipart/form-data',
  })
  url!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { key: 'publico/destinos/3f1c.jpg', 'Content-Type': 'image/jpeg', Policy: '...' },
    description:
      'Campos que vao no formulario, na ordem, ANTES do campo `file` com o arquivo. ' +
      'O S3 responde 204 quando aceita.',
  })
  campos!: Record<string, string>;

  @ApiProperty({ example: 'publico/destinos/3f1c2b7e.jpg', description: 'Chave do objeto' })
  chave!: string;

  @ApiProperty({
    example: 'http://localhost:4566/viajajunto-local-midia/publico/destinos/3f1c2b7e.jpg',
    description: 'Endereco de leitura da foto: e o que vai em `fotoUrl` depois do envio',
  })
  urlPublica!: string;

  @ApiProperty({ example: 5242880, description: 'O S3 recusa arquivos maiores (EntityTooLarge)' })
  tamanhoMaximoBytes!: number;

  @ApiProperty({ example: '2027-01-10T12:10:00.000Z', description: 'Prazo para usar o formulario' })
  expiraEm!: string;
}
