import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArmazenamentoService } from '../../aws/armazenamento.service';
import { CodigoErro } from '../../common/erros/codigos-erro';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
} from '../../common/swagger/api-respostas.decorator';
import { SolicitarUploadDto, UploadAutorizadoDto } from './dto/upload.dto';

const PASTAS = { DESTINO: 'destinos', ATIVIDADE: 'atividades' } as const;

@ApiTags('Uploads')
@ApiAutenticado()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly armazenamento: ArmazenamentoService) {}

  @Throttle({ global: { limit: 30, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: 'Autorizar o envio de uma foto',
    description:
      'Devolve um formulario assinado para o navegador enviar a imagem direto ao S3, sem ' +
      'passar pela API. Fluxo: (1) chame esta rota; (2) faca POST multipart em `url` com os ' +
      '`campos` e, por ultimo, o campo `file`; (3) use a `urlPublica` em `fotoUrl` do destino ' +
      'ou da atividade. O S3 recusa arquivo de outro tipo ou acima do tamanho maximo.',
  })
  @ApiCreatedResponse({ type: UploadAutorizadoDto })
  @ApiErroValidacao('Tipo de arquivo nao aceito: use image/jpeg, image/png, image/webp')
  @ApiErro(503, CodigoErro.UPLOAD_INDISPONIVEL, 'Armazenamento de arquivos nao configurado')
  autorizar(@Body() dto: SolicitarUploadDto): Promise<UploadAutorizadoDto> {
    return this.armazenamento.autorizarUpload(PASTAS[dto.finalidade], dto.tipoConteudo);
  }
}
