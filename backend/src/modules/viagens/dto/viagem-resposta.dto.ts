import { ApiProperty } from '@nestjs/swagger';
import { StatusViagem } from '@prisma/client';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';
import { DestinoViagemDto } from '../../destinos/dto/destino-resposta.dto';
import { MembroDto } from '../../membros/dto/membro-resposta.dto';
import { OrcamentoDto } from '../../orcamento/dto/orcamento-resposta.dto';

/** RF04, RF07 - dados da viagem. */
export class ViagemDto {
  @ApiProperty({ example: 'A3KD9F2P', description: 'Codigo da viagem, tambem usado como convite' })
  id!: string;

  @ApiProperty({ example: 'Eurotrip 2027' })
  nome!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Roteiro de 15 dias por Portugal, Espanha e Franca',
  })
  descricao!: string | null;

  @ApiProperty({ type: Date, nullable: true, example: '2027-01-10T00:00:00.000Z' })
  dataInicio!: Date | null;

  @ApiProperty({ type: Date, nullable: true, example: '2027-01-25T00:00:00.000Z' })
  dataFim!: Date | null;

  @ApiProperty({ enum: StatusViagem, example: StatusViagem.EM_PLANEJAMENTO })
  status!: StatusViagem;

  @ApiProperty({ example: 1, description: 'Id do usuario criador' })
  criadoPor!: number;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  criadoEm!: Date;
}

export class ContagemViagemDto {
  @ApiProperty({ example: 2, description: 'Colaboradores, sem contar o criador' })
  membros!: number;

  @ApiProperty({ example: 3 })
  destinos!: number;
}

/** RF06 - item do painel pessoal. */
export class ViagemResumoDto extends ViagemDto {
  @ApiProperty({ type: ContagemViagemDto })
  _count!: ContagemViagemDto;
}

export class PaginaViagensDto extends PaginaBaseDto {
  @ApiProperty({ type: [ViagemResumoDto] })
  itens!: ViagemResumoDto[];
}

/** RN06 - viagem completa, visivel apenas para membros. */
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
