import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { CodigoErro } from '../common/erros/codigos-erro';
import { indisponivel } from '../common/erros/erros';
import { Configuracao } from '../config/configuracao';

/** Tipos de imagem aceitos e a extensao com que o arquivo e gravado. */
export const TIPOS_DE_IMAGEM = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type TipoDeImagem = keyof typeof TIPOS_DE_IMAGEM;

/** O formulario assinado vale por 10 minutos: tempo de sobra para o navegador enviar. */
const VALIDADE_SEGUNDOS = 600;

export interface UploadAutorizado {
  url: string;
  campos: Record<string, string>;
  chave: string;
  urlPublica: string;
  tamanhoMaximoBytes: number;
  expiraEm: string;
}

/**
 * Upload direto do navegador para o S3, sem o arquivo passar pela API.
 *
 * A API so assina um formulario (presigned POST) cuja politica fixa o nome do
 * objeto, o tipo de conteudo e o tamanho maximo - o proprio S3 recusa o que sair
 * disso. O formulario e assinado com o endereco publico do S3, porque e o
 * navegador quem vai usa-lo.
 */
@Injectable()
export class ArmazenamentoService {
  private readonly cliente?: S3Client;
  private readonly bucket?: string;
  private readonly baseUrlPublica?: string;
  private readonly tamanhoMaximoBytes: number;

  constructor(config: ConfigService) {
    const aws = config.get<Configuracao['aws']>('aws')!;
    this.tamanhoMaximoBytes = aws.tamanhoMaximoUploadMb * 1024 * 1024;

    if (!aws.bucketMidia) {
      return;
    }

    const endpoint = aws.endpointPublicoS3 ?? aws.endpoint;
    this.bucket = aws.bucketMidia;
    // Fora da AWS o bucket fica no caminho (host/bucket/chave): o subdominio
    // bucket.localhost nao resolve no navegador.
    this.cliente = new S3Client({ region: aws.regiao, endpoint, forcePathStyle: !!endpoint });
    this.baseUrlPublica = endpoint
      ? `${endpoint.replace(/\/+$/, '')}/${this.bucket}`
      : `https://${this.bucket}.s3.${aws.regiao}.amazonaws.com`;
  }

  async autorizarUpload(pasta: string, tipo: TipoDeImagem): Promise<UploadAutorizado> {
    if (!this.cliente || !this.bucket || !this.baseUrlPublica) {
      throw indisponivel(
        CodigoErro.UPLOAD_INDISPONIVEL,
        'O envio de arquivos nao esta configurado neste ambiente (S3_BUCKET_MIDIA)',
      );
    }

    // Prefixo `publico/`: e o unico que a politica do bucket libera para leitura.
    const chave = `publico/${pasta}/${randomUUID()}.${TIPOS_DE_IMAGEM[tipo]}`;

    const { url, fields } = await createPresignedPost(this.cliente, {
      Bucket: this.bucket,
      Key: chave,
      Fields: { 'Content-Type': tipo },
      Conditions: [
        ['content-length-range', 1, this.tamanhoMaximoBytes],
        ['eq', '$Content-Type', tipo],
      ],
      Expires: VALIDADE_SEGUNDOS,
    });

    return {
      url,
      campos: fields,
      chave,
      urlPublica: `${this.baseUrlPublica}/${chave}`,
      tamanhoMaximoBytes: this.tamanhoMaximoBytes,
      expiraEm: new Date(Date.now() + VALIDADE_SEGUNDOS * 1000).toISOString(),
    };
  }
}
