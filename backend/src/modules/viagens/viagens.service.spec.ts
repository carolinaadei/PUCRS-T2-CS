import { Test } from '@nestjs/testing';
import { StatusViagem } from '@prisma/client';
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

  it('gera um codigo de convite de 8 caracteres ao criar a viagem', async () => {
    prisma.viagem.create.mockImplementation(({ data }) => Promise.resolve(data));

    const viagem = await service.criar(1, { nome: 'Eurotrip 2027' });

    expect(viagem.id).toHaveLength(8);
    expect(viagem.id).toMatch(/^[A-Z2-9]+$/);
    expect(viagem.status).toBe(StatusViagem.EM_PLANEJAMENTO);
    expect(viagem.criadoPor).toBe(1);
  });

  it('lista viagens criadas pelo usuario e aquelas em que ele e colaborador (RF06)', async () => {
    prisma.viagem.findMany.mockResolvedValue([]);
    prisma.viagem.count.mockResolvedValue(0);

    await service.listarDoUsuario(7, new PaginacaoDto());

    const filtro = prisma.viagem.findMany.mock.calls[0][0].where;
    expect(filtro.OR).toEqual([{ criadoPor: 7 }, { membros: { some: { usuarioId: 7 } } }]);
  });
});
