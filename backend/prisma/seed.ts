import {
  CategoriaDestino,
  PermissaoMembro,
  PrismaClient,
  StatusAtividade,
  StatusViagem,
  TipoAtividade,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Dados de demonstracao para desenvolvimento local e para quem constroi o front:
 * dois usuarios, uma viagem em planejamento compartilhada, uma viagem concluida
 * (que alimenta os paises visitados, as avaliacoes e os destaques) e o catalogo.
 *
 * Idempotente: roda a cada `docker compose up` sem duplicar nada. Todos os dados
 * sao ficticios e usam o dominio reservado `example.com`.
 *
 * Execute com: npm run prisma:seed
 */
async function main() {
  const senhaHash = await bcrypt.hash('senha12345', 10);

  const criador = await prisma.usuario.upsert({
    where: { email: 'ana.souza@example.com' },
    update: {},
    create: { nome: 'Ana Souza', email: 'ana.souza@example.com', senhaHash },
  });

  const colaborador = await prisma.usuario.upsert({
    where: { email: 'bruno.lima@example.com' },
    update: {},
    create: { nome: 'Bruno Lima', email: 'bruno.lima@example.com', senhaHash },
  });

  const lisboa = await prisma.destinoCatalogo.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nome: 'Lisboa',
      pais: 'Portugal',
      categoria: CategoriaDestino.CIDADE,
      descricao: 'Capital portuguesa, entre miradouros e o Tejo.',
      latitude: 38.7223,
      longitude: -9.1393,
    },
  });

  const florianopolis = await prisma.destinoCatalogo.upsert({
    where: { id: 2 },
    update: {},
    create: {
      nome: 'Florianopolis',
      pais: 'Brasil',
      categoria: CategoriaDestino.PRAIA,
      descricao: 'Ilha com mais de 40 praias no litoral de Santa Catarina.',
      latitude: -27.5954,
      longitude: -48.548,
    },
  });

  const torreBelem = await prisma.catalogoAtividade.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nome: 'Torre de Belem',
      descricao: 'Fortificacao do seculo XVI as margens do Tejo.',
      tipoAtividade: TipoAtividade.PASSEIO,
      cidade: 'Lisboa',
      pais: 'Portugal',
      latitude: 38.6916,
      longitude: -9.216,
      fonte: 'seed',
    },
  });

  const lagoinha = await prisma.catalogoAtividade.upsert({
    where: { id: 2 },
    update: {},
    create: {
      nome: 'Trilha da Lagoinha do Leste',
      descricao: 'Trilha de 4 km ate uma das praias mais isoladas da ilha.',
      tipoAtividade: TipoAtividade.PASSEIO,
      cidade: 'Florianopolis',
      pais: 'Brasil',
      latitude: -27.7745,
      longitude: -48.4867,
      fonte: 'seed',
    },
  });

  // Viagem em planejamento, compartilhada com o Bruno como EDITOR.
  const eurotrip = await prisma.viagem.upsert({
    where: { id: 'DEMO2027' },
    update: {},
    create: {
      id: 'DEMO2027',
      codigoConvite: 'EURO2027',
      nome: 'Eurotrip 2027',
      descricao: 'Viagem de demonstracao criada pelo seed.',
      dataInicio: new Date('2027-01-10'),
      dataFim: new Date('2027-01-25'),
      status: StatusViagem.EM_PLANEJAMENTO,
      criadoPor: criador.id,
      membros: { create: [{ usuarioId: colaborador.id, permissao: PermissaoMembro.EDITOR }] },
      orcamento: { create: { valorTotal: 12000 } },
      destinos: {
        create: [
          {
            destinoCatalogoId: lisboa.id,
            chegada: new Date('2027-01-10'),
            saida: new Date('2027-01-16'),
            ordem: 0,
            atividades: {
              create: [
                {
                  catalogoAtividadeId: torreBelem.id,
                  dataHorario: new Date('2027-01-11T14:30:00.000Z'),
                  duracaoMin: 90,
                  custoPrevisto: 120,
                  status: StatusAtividade.CONFIRMADA,
                },
              ],
            },
          },
        ],
      },
    },
  });

  // Viagem ja concluida: aparece no mapa de paises e libera avaliar a trilha.
  const floripa = await prisma.viagem.upsert({
    where: { id: 'DEMO2026' },
    update: {},
    create: {
      id: 'DEMO2026',
      codigoConvite: 'FLOR2026',
      nome: 'Floripa 2026',
      dataInicio: new Date('2026-03-01'),
      dataFim: new Date('2026-03-08'),
      status: StatusViagem.CONCLUIDA,
      criadoPor: criador.id,
      membros: { create: [{ usuarioId: colaborador.id, permissao: PermissaoMembro.VISUALIZADOR }] },
      destinos: {
        create: [
          {
            destinoCatalogoId: florianopolis.id,
            chegada: new Date('2026-03-01'),
            saida: new Date('2026-03-08'),
            ordem: 0,
            atividades: {
              create: [
                {
                  catalogoAtividadeId: lagoinha.id,
                  dataHorario: new Date('2026-03-03T09:00:00.000-03:00'),
                  duracaoMin: 180,
                  custoPrevisto: 0,
                  status: StatusAtividade.CONCLUIDA,
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.avaliacao.upsert({
    where: {
      usuarioId_catalogoAtividadeId: { usuarioId: criador.id, catalogoAtividadeId: lagoinha.id },
    },
    update: {},
    create: {
      usuarioId: criador.id,
      catalogoAtividadeId: lagoinha.id,
      nota: 5,
      comentario: 'Leve agua e saia cedo: a volta e puxada, mas a praia compensa.',
    },
  });

  // Campos derivados coerentes com o que o seed acabou de gravar.
  const soma = await prisma.atividadeViagem.aggregate({
    where: { destinoViagem: { viagemId: eurotrip.id } },
    _sum: { custoPrevisto: true },
  });
  await prisma.orcamento.update({
    where: { viagemId: eurotrip.id },
    data: { previstoAtividades: soma._sum.custoPrevisto ?? 0 },
  });

  for (const atividade of [torreBelem, lagoinha]) {
    const { _avg } = await prisma.avaliacao.aggregate({
      where: { catalogoAtividadeId: atividade.id },
      _avg: { nota: true },
    });
    await prisma.catalogoAtividade.update({
      where: { id: atividade.id },
      data: { mediaAvaliacao: _avg.nota ? Math.round(_avg.nota * 10) / 10 : 0 },
    });
  }

  console.log('Seed concluido. Dados ficticios apenas para desenvolvimento local:');
  console.log(`  Cria as viagens : ${criador.email}`);
  console.log(`  Colabora nelas  : ${colaborador.email}`);
  console.log('  Senha de ambos: senha12345');
  console.log(`  Viagens: ${eurotrip.id} (convite ${eurotrip.codigoConvite}), ${floripa.id} (concluida)`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
