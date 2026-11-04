import { ApiProperty } from '@nestjs/swagger';
import { StatusViagem } from '@prisma/client';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';
import { DestinoViagemDto } from '../../destinos/dto/destino-resposta.dto';
import { MembroDto } from '../../membros/dto/membro-resposta.dto';
import { OrcamentoDto } from '../../orcamento/dto/orcamento-resposta.dto';

export const PAPEIS = ['CRIADOR', 'EDITOR', 'VISUALIZADOR'] as const;

/** Dados da viagem, do ponto de vista de quem fez a requisicao. */
export class ViagemDto {
  @ApiProperty({ example: 'DEMO2027', description: 'Id da viagem, usado nas URLs' })
  id!: string;

  @ApiProperty({ example: 'Eurotrip 2027' })
  nome!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Viagem de demonstracao criada pelo seed.',
  })
  descricao!: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-01-10' })
  dataInicio!: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-01-25' })
  dataFim!: string | null;

  @ApiProperty({
    enum: StatusViagem,
    enumName: 'StatusViagem',
    example: StatusViagem.EM_PLANEJAMENTO,
  })
  status!: StatusViagem;

  @ApiProperty({ example: 1, description: 'Id do usuario criador' })
  criadoPor!: number;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  criadoEm!: Date;

  @ApiProperty({
    enum: PAPEIS,
    example: 'CRIADOR',
    description: 'Seu papel na viagem: decide o que a interface deixa editar',
  })
  minhaPermissao!: (typeof PAPEIS)[number];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'K7M2Q9XA',
    description: 'Codigo para convidar colaboradores. So o criador o recebe; para os demais, null',
  })
  codigoConvite!: string | null;
}

export class TotaisViagemDto {
  @ApiProperty({ example: 1, description: 'Colaboradores, sem contar o criador' })
  colaboradores!: number;

  @ApiProperty({ example: 2 })
  destinos!: number;
}

/** Item do painel pessoal. */
export class ViagemResumoDto extends ViagemDto {
  @ApiProperty({ type: TotaisViagemDto })
  totais!: TotaisViagemDto;
}

export class PaginaViagensDto extends PaginaBaseDto {
  @ApiProperty({ type: [ViagemResumoDto] })
  itens!: ViagemResumoDto[];
}

/** Viagem completa, visivel apenas para quem participa. */
export class ViagemDetalheDto extends ViagemDto {
  @ApiProperty({ type: UsuarioResumoDto })
  criador!: UsuarioResumoDto;

  @ApiProperty({ type: [MembroDto], description: 'Colaboradores, por ordem de entrada' })
  membros!: MembroDto[];

  @ApiProperty({ type: [DestinoViagemDto], description: 'Destinos em ordem de visita' })
  destinos!: DestinoViagemDto[];

  @ApiProperty({ type: OrcamentoDto, nullable: true, description: 'null se nao definido' })
  orcamento!: OrcamentoDto | null;
}
