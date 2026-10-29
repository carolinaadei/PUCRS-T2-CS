import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, StatusViagem } from '@prisma/client';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AtualizarViagemDto } from './dto/atualizar-viagem.dto';
import { ViagensService } from './viagens.service';

/** A mensagem e o que o usuario le: confere o tipo do erro e o texto. */
const esperarRecusa = async (promessa: Promise<unknown>, mensagem: string) => {
  await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
  await expect(promessa).rejects.toThrow(mensagem);
};

/**
 * Exemplo de teste unitario com o Prisma mockado - use como modelo
 * para os demais services (Secao 7 do Documento de Arquitetura: Testabilidade).
 */
describe('ViagensService', () => {
  let service: ViagensService;
  let prisma: {
    viagem: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      viagem: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((promessas: unknown[]) => Promise.all(promessas)),
    };

    const modulo = await Test.createTestingModule({
      providers: [ViagensService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get(ViagensService);
  });

  describe('criar (RF04)', () => {
    beforeEach(() => {
      prisma.viagem.create.mockImplementation(({ data }) => Promise.resolve(data));
    });

    it('gera um codigo de convite de 8 caracteres ao criar a viagem', async () => {
      const viagem = await service.criar(1, { nome: 'Eurotrip 2027' });

      expect(viagem.id).toHaveLength(8);
      expect(viagem.id).toMatch(/^[A-Z2-9]+$/);
      expect(viagem.status).toBe(StatusViagem.EM_PLANEJAMENTO);
      expect(viagem.criadoPor).toBe(1);
    });

    it('grava nome, descricao e datas gerais informados', async () => {
      const viagem = await service.criar(1, {
        nome: 'Eurotrip 2027',
        descricao: 'Roteiro de 15 dias',
        dataInicio: '2027-01-10',
        dataFim: '2027-01-25',
      });

      expect(viagem.nome).toBe('Eurotrip 2027');
      expect(viagem.descricao).toBe('Roteiro de 15 dias');
      // O dia gravado nao pode variar com o fuso do servidor.
      expect(viagem.dataInicio?.toISOString()).toBe('2027-01-10T00:00:00.000Z');
      expect(viagem.dataFim?.toISOString()).toBe('2027-01-25T00:00:00.000Z');
    });

    it('aceita viagem sem datas definidas', async () => {
      const viagem = await service.criar(1, { nome: 'Viagem sem data' });

      expect(viagem.dataInicio).toBeNull();
      expect(viagem.dataFim).toBeNull();
    });

    it('rejeita data de fim anterior a data de inicio', async () => {
      await esperarRecusa(
        service.criar(1, { nome: 'Eurotrip', dataInicio: '2027-01-25', dataFim: '2027-01-10' }),
        'A data de fim nao pode ser anterior a data de inicio',
      );

      expect(prisma.viagem.create).not.toHaveBeenCalled();
    });

    it('rejeita data de fim sem data de inicio', async () => {
      await esperarRecusa(
        service.criar(1, { nome: 'Eurotrip', dataFim: '2027-01-10' }),
        'Uma viagem com data de fim precisa ter data de inicio',
      );
    });

    it('rejeita dia inexistente no calendario', async () => {
      await esperarRecusa(
        service.criar(1, { nome: 'Eurotrip', dataInicio: '2027-02-31' }),
        'A data de inicio 2027-02-31 nao existe no calendario',
      );
    });

    it('gera outro codigo quando o sorteado ja existe', async () => {
      const colisao = new Prisma.PrismaClientKnownRequestError('codigo duplicado', {
        code: 'P2002',
        clientVersion: 'teste',
      });

      prisma.viagem.create
        .mockRejectedValueOnce(colisao)
        .mockImplementationOnce(({ data }) => Promise.resolve(data));

      const viagem = await service.criar(1, { nome: 'Eurotrip 2027' });

      expect(prisma.viagem.create).toHaveBeenCalledTimes(2);
      expect(viagem.id).toHaveLength(8);
    });
  });

  describe('atualizar (RF05, RF07)', () => {
    const INICIO_GRAVADO = new Date('2027-01-10T00:00:00.000Z');
    const FIM_GRAVADO = new Date('2027-01-25T00:00:00.000Z');

    beforeEach(() => {
      prisma.viagem.findUniqueOrThrow.mockResolvedValue({
        dataInicio: INICIO_GRAVADO,
        dataFim: FIM_GRAVADO,
      });
      prisma.viagem.update.mockImplementation(({ data }) => Promise.resolve(data));
    });

    it('muda so o status e mantem as datas gravadas', async () => {
      const viagem = await service.atualizar('A3KD9F2P', { status: StatusViagem.CONFIRMADA });

      expect(viagem).toMatchObject({
        status: StatusViagem.CONFIRMADA,
        dataInicio: INICIO_GRAVADO,
        dataFim: FIM_GRAVADO,
      });
      expect(viagem.nome).toBeUndefined();
    });

    it('rejeita data de fim anterior ao inicio ja gravado', async () => {
      await esperarRecusa(
        service.atualizar('A3KD9F2P', { dataFim: '2027-01-05' }),
        'A data de fim nao pode ser anterior a data de inicio',
      );

      expect(prisma.viagem.update).not.toHaveBeenCalled();
    });

    it('rejeita dia inexistente no calendario', async () => {
      await esperarRecusa(
        service.atualizar('A3KD9F2P', { dataFim: '2027-02-30' }),
        'A data de fim 2027-02-30 nao existe no calendario',
      );
    });

    it('apaga as datas recebidas como null', async () => {
      const viagem = await service.atualizar('A3KD9F2P', { dataInicio: null, dataFim: null });

      expect(viagem.dataInicio).toBeNull();
      expect(viagem.dataFim).toBeNull();
    });

    it('nao apaga o inicio enquanto houver data de fim', async () => {
      await esperarRecusa(
        service.atualizar('A3KD9F2P', { dataInicio: null }),
        'Uma viagem com data de fim precisa ter data de inicio',
      );
    });

    it('ignora null em nome e status, que sao obrigatorios', async () => {
      const viagem = await service.atualizar('A3KD9F2P', {
        nome: null,
        status: null,
      } as unknown as AtualizarViagemDto);

      expect(viagem.nome).toBeUndefined();
      expect(viagem.status).toBeUndefined();
    });
  });

  it('lista viagens criadas pelo usuario e aquelas em que e colaborador (RF06)', async () => {
    prisma.viagem.findMany.mockResolvedValue([]);
    prisma.viagem.count.mockResolvedValue(0);

    await service.listarDoUsuario(7, new PaginacaoDto());

    const filtro = prisma.viagem.findMany.mock.calls[0][0].where;
    expect(filtro.OR).toEqual([{ criadoPor: 7 }, { membros: { some: { usuarioId: 7 } } }]);
  });
});
