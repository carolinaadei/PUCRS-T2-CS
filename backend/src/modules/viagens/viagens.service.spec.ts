import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, StatusViagem } from '@prisma/client';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ViagensService } from './viagens.service';

/**
 * Exemplo de teste unitario com o Prisma mockado - use como modelo
 * para os demais services (Secao 7 do Documento de Arquitetura: Testabilidade).
 */
describe('ViagensService', () => {
  let service: ViagensService;
  let prisma: {
    viagem: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      viagem: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
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
        nome: '  Eurotrip 2027  ',
        descricao: '  Roteiro de 15 dias  ',
        dataInicio: '2027-01-10',
        dataFim: '2027-01-25',
      });

      expect(viagem.nome).toBe('Eurotrip 2027');
      expect(viagem.descricao).toBe('Roteiro de 15 dias');
      // O dia gravado nao pode variar com o fuso do servidor.
      expect(viagem.dataInicio?.toISOString()).toBe('2027-01-10T00:00:00.000Z');
      expect(viagem.dataFim?.toISOString()).toBe('2027-01-25T00:00:00.000Z');
    });

    it('aceita viagem sem descricao e sem datas definidas', async () => {
      const viagem = await service.criar(1, { nome: 'Viagem sem data' });

      expect(viagem.descricao).toBeNull();
      expect(viagem.dataInicio).toBeNull();
      expect(viagem.dataFim).toBeNull();
    });

    it('rejeita data de fim anterior a data de inicio', async () => {
      await expect(
        service.criar(1, { nome: 'Eurotrip', dataInicio: '2027-01-25', dataFim: '2027-01-10' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.viagem.create).not.toHaveBeenCalled();
    });

    it('rejeita data de fim sem data de inicio', async () => {
      await expect(
        service.criar(1, { nome: 'Eurotrip', dataFim: '2027-01-10' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita dia inexistente no calendario', async () => {
      await expect(
        service.criar(1, { nome: 'Eurotrip', dataInicio: '2027-02-31' }),
      ).rejects.toBeInstanceOf(BadRequestException);
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

  it('lista viagens criadas pelo usuario e aquelas em que e colaborador (RF06)', async () => {
    prisma.viagem.findMany.mockResolvedValue([]);
    prisma.viagem.count.mockResolvedValue(0);

    await service.listarDoUsuario(7, new PaginacaoDto());

    const filtro = prisma.viagem.findMany.mock.calls[0][0].where;
    expect(filtro.OR).toEqual([{ criadoPor: 7 }, { membros: { some: { usuarioId: 7 } } }]);
  });
});
