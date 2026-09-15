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
 * Dados minimos para desenvolvimento local: dois usuarios, uma viagem
 * compartilhada, dois destinos, atividades e orcamento.
 *
 * Todos os dados sao ficticios e usam o dominio reservado `example.com`.
 * Substitua livremente pelos seus proprios dados de teste.
 *
 * Execute com: npm run prisma:seed
 */
async function main() {
  const senhaHash = await bcrypt.hash('senha12345', 10);

  const criador = await prisma.usuario.upsert({
    where: { email: 'ana.souza@example.com' },
    update: {},
    create: {
      nome: 'Ana Souza',
      email: 'ana.souza@example.com',
      senhaHash,
    },
  });

  const colaborador = await prisma.usuario.upsert({
    where: { email: 'bruno.lima@example.com' },
    update: {},
    create: {
      nome: 'Bruno Lima',
      email: 'bruno.lima@example.com',
      senhaHash,
    },
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

  const viagem = await prisma.viagem.upsert({
    where: { id: 'DEMO2027' },
    update: {},
    create: {
      id: 'DEMO2027',
      nome: 'Eurotrip 2027',
      descricao: 'Viagem de demonstracao criada pelo seed.',
      dataInicio: new Date('2027-01-10'),
      dataFim: new Date('2027-01-25'),
      status: StatusViagem.EM_PLANEJAMENTO,
      criadoPor: criador.id,
      membros: {
        create: [{ usuarioId: colaborador.id, permissao: PermissaoMembro.EDITOR }],
      },
      orcamento: {
        create: { valorTotal: 12000 },
      },
    },
  });

  const destinoLisboa = await prisma.destinoViagem.upsert({
    where: { id: 1 },
    update: {},
    create: {
      viagemId: viagem.id,
      destinoCatalogoId: lisboa.id,
      chegada: new Date('2027-01-10'),
      saida: new Date('2027-01-16'),
      ordem: 0,
    },
  });

  await prisma.atividadeViagem.upsert({
    where: { id: 1 },
    update: {},
    create: {
      destinoViagemId: destinoLisboa.id,
      catalogoAtividadeId: torreBelem.id,
      dataHorario: new Date('2027-01-11T14:30:00.000Z'),
      duracaoMin: 90,
      custoPrevisto: 120,
      status: StatusAtividade.CONFIRMADA,
    },
  });

  // Mantem previsto_atividades e media_avaliacao coerentes apos o seed.
  const soma = await prisma.atividadeViagem.aggregate({
    where: { destinoViagem: { viagemId: viagem.id } },
    _sum: { custoPrevisto: true },
  });

  await prisma.orcamento.update({
    where: { viagemId: viagem.id },
    data: { previstoAtividades: soma._sum.custoPrevisto ?? 0 },
  });

  console.log('Seed concluido. Dados ficticios apenas para desenvolvimento local:');
  console.log(`  Criador     : ${criador.email}`);
  console.log(`  Colaborador : ${colaborador.email} (permissao EDITOR)`);
  console.log('  Senha de ambos: senha12345');
  console.log(`  Codigo de convite da viagem: ${viagem.id}`);
  console.log(`  Destinos no catalogo: ${lisboa.nome}, ${florianopolis.nome}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
