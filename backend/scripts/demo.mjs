// Demo visual e verificacao real do fluxo. A chave Geoapify fica no servidor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as esperar } from 'node:timers/promises';
import dotenv from 'dotenv';

const arquivoEnv = fileURLToPath(new URL('../.env', import.meta.url));
const env = dotenv.parse(readFileSync(arquivoEnv));
const base = process.env.DEMO_API_URL || `http://localhost:${env.API_PORT || env.PORT || 3000}`;
const ms = process.env.DEMO_MINISTACK_URL || `http://localhost:${env.MINISTACK_PORT || 4566}`;
const automatico = process.argv.includes('--automatico');
const limpar = process.argv.includes('--limpar');
const terminal = createInterface({ input: process.stdin, output: process.stdout });
const sufixo = Date.now();
const senha = 'senha12345';
const novaSenha = 'novaSenha12345';
const emailAna = `ana.demo.${sufixo}@example.com`;
const emailBruno = `bruno.demo.${sufixo}@example.com`;
let chamadas = 0;

const mostrar = (dados) => console.log(JSON.stringify(dados, null, 2));
async function etapa(titulo, tempo) {
  if (!automatico) {
    await terminal.question(`\nENTER para ${titulo} [${tempo}] `);
    console.clear();
  }
  console.log(`\nViajaJunto | ${titulo} | ${tempo}\n`);
}
async function api(metodo, caminho, token, corpo, esperado = 200) {
  const r = await fetch(`${base}/api/v1${caminho}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  chamadas++;
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : null;
  console.log(`HTTP ${r.status} | ${metodo} ${caminho}`);
  assert.equal(r.status, esperado, dados?.mensagem || 'Status inesperado');
  return dados;
}

try {
  console.log('Demo visual: cada ENTER executa uma etapa real. Tokens e chave ficam ocultos.');
  console.log(`API: ${base} | Swagger: ${base}/api/docs`);
  await etapa('01. Ambiente e saude', '0:00-0:10');
  const saude = await (await fetch(`${base}/api/health/ready`)).json();
  assert.equal(saude.status, 'ok');
  mostrar(saude);

  await etapa('02. Cadastro, login e painel pessoal', '0:10-0:30');
  const ana = await api(
    'POST',
    '/auth/registrar',
    null,
    { nome: 'Ana Demo', email: emailAna, senha },
    201,
  );
  const bruno = await api(
    'POST',
    '/auth/registrar',
    null,
    { nome: 'Bruno Demo', email: emailBruno, senha },
    201,
  );
  const login = await api('POST', '/auth/login', null, { email: emailAna, senha });
  const a = login.accessToken;
  const b = bruno.accessToken;
  mostrar({
    usuarios: [ana.usuario.nome, bruno.usuario.nome],
    autenticacao: 'JWT e refresh token recebidos',
  });
  mostrar(await api('GET', '/viagens', a));

  await etapa('03. Criar viagem', '0:30-0:45');
  const viagem = await api(
    'POST',
    '/viagens',
    a,
    { nome: 'Porto com amigos', dataInicio: '2027-01-10', dataFim: '2027-01-15' },
    201,
  );
  const url = `/viagens/${viagem.id}`;
  mostrar(viagem);
  assert.equal((await api('GET', '/viagens', a)).itens[0].id, viagem.id);

  await etapa('04. Convite e permissoes', '0:45-1:15');
  mostrar(await api('GET', url, b, null, 404));
  await api('GET', `/convites/${viagem.codigoConvite}`, b);
  const membro = await api('POST', `/convites/${viagem.codigoConvite}/aceitar`, b, null, 201);
  mostrar({ permissaoInicial: membro.permissao });
  mostrar(await api('PATCH', url, b, { nome: 'Tentativa de edicao' }, 403));
  const promovido = await api('PATCH', `${url}/membros/${membro.id}`, a, { permissao: 'EDITOR' });
  mostrar({ permissaoAtual: promovido.permissao });

  await etapa('05. Geoapify: cidade e importacao sem duplicar', '1:15-1:40');
  const cidades = await api('GET', '/lugares/cidades?busca=Porto&pais=pt&limite=1', a);
  assert.ok(cidades.length);
  await api('GET', '/lugares/cidades?busca=Por&pais=pt&autocompletar=true&limite=1', a);
  const cidade = await api(
    'POST',
    '/lugares/destinos/importar',
    a,
    { idExterno: cidades[0].idExterno },
    201,
  );
  const repetida = await api(
    'POST',
    '/lugares/destinos/importar',
    a,
    { idExterno: cidades[0].idExterno },
    201,
  );
  assert.equal(cidade.id, repetida.id);
  mostrar({
    id: cidade.id,
    nome: cidade.nome,
    pais: cidade.pais,
    codigoPais: cidade.codigoPais,
    fonte: cidade.fonte,
    importacaoRepetida: 'mesmo id',
    atribuicoes: cidade.atribuicoes,
  });

  await etapa('06. Geoapify: lugar e roteiro', '1:40-2:05');
  const destino = await api(
    'POST',
    `${url}/destinos`,
    b,
    { destinoCatalogoId: cidade.id, chegada: '2027-01-10', saida: '2027-01-15' },
    201,
  );
  const lugares = await api(
    'GET',
    `/lugares/atividades?latitude=${cidade.latitude}&longitude=${cidade.longitude}&tipoAtividade=PASSEIO&limite=5`,
    b,
  );
  assert.ok(lugares.length);
  const lugar = await api(
    'POST',
    '/lugares/atividades/importar',
    b,
    { idExterno: lugares[0].idExterno },
    201,
  );
  const atividade = await api(
    'POST',
    `${url}/atividades`,
    b,
    {
      destinoViagemId: destino.id,
      catalogoAtividadeId: lugar.id,
      dataHorario: '2027-01-11T14:30:00-03:00',
      custoPrevisto: 120.5,
    },
    201,
  );
  const roteiro = await api('GET', `${url}/atividades`, a);
  assert.equal(roteiro[0].catalogoAtividade.fonte, 'geoapify');
  mostrar({
    destino: cidade.nome,
    atividade: lugar.nome,
    custoPrevisto: atividade.custoPrevisto,
    fonte: lugar.fonte,
    atribuicoes: lugar.atribuicoes,
  });

  await etapa('07. Foto: upload direto ao S3', '2:05-2:25');
  const upload = await api(
    'POST',
    '/uploads',
    b,
    { finalidade: 'ATIVIDADE', tipoConteudo: 'image/png' },
    201,
  );
  const formulario = new FormData();
  for (const [campo, valor] of Object.entries(upload.campos)) formulario.append(campo, valor);
  const imagem = readFileSync(new URL('../../docs/stylesheets/assets/logo.png', import.meta.url));
  formulario.append('file', new Blob([imagem], { type: 'image/png' }), 'logo.png');
  const envio = await fetch(upload.url, { method: 'POST', body: formulario });
  assert.equal(envio.status, 204);
  console.log('HTTP 204 | POST direto ao S3');
  const foto = await fetch(upload.urlPublica);
  assert.equal(foto.status, 200);
  assert.equal((await foto.arrayBuffer()).byteLength, imagem.length);
  // Um item proprio permite repetir a demo mesmo quando o lugar externo ja tem outro autor.
  const comFoto = await api(
    'POST',
    '/atividades',
    b,
    { nome: `Passeio com foto ${sufixo}`, tipoAtividade: 'OUTRO', fotoUrl: upload.urlPublica },
    201,
  );
  mostrar({ fotoUrl: comFoto.fotoUrl, arquivo: 'PNG enviado e lido de volta com sucesso' });

  await etapa('08. Orcamento e notificacoes', '2:25-2:45');
  await api('PUT', `${url}/orcamento`, b, { valorTotal: 5000 });
  const resumo = await api('GET', `${url}/orcamento/resumo`, a);
  assert.equal(resumo.saldoDisponivel, '4879.50');
  mostrar(resumo);
  const avisos = await api('GET', '/notificacoes', a);
  mostrar({ notificacoes: avisos.itens.map(({ tipo }) => tipo) });

  await etapa('09. Concluir, avaliar e paises visitados', '2:45-3:05');
  await api('PATCH', `${url}/atividades/${atividade.id}`, a, { status: 'CONCLUIDA' });
  await api('PATCH', url, a, { status: 'CONCLUIDA' });
  await api(
    'PUT',
    `/atividades/${lugar.id}/avaliacoes/minha`,
    a,
    { nota: 5, comentario: 'Otima experiencia no Porto.' },
    201,
  );
  const detalhe = await api('GET', `/atividades/${lugar.id}`);
  mostrar({ atividade: detalhe.nome, media: detalhe.mediaAvaliacao, minhaAvaliacao: 5 });
  const paises = await api('GET', '/usuarios/eu/paises-visitados', a);
  assert.ok(paises.some((p) => p.codigo === 'PT'));
  mostrar(paises);

  await etapa('10. Remover colaborador e perder acesso', '3:05-3:20');
  await api('DELETE', `${url}/membros/${membro.id}`, a, null, 204);
  mostrar(await api('GET', url, b, null, 404));
  mostrar(await api('GET', '/viagens', b));

  await etapa('11. Recuperacao via fila, worker e e-mail', '3:20-3:50');
  await api('POST', '/auth/recuperar-senha', null, { email: emailBruno }, 202);
  let codigo;
  for (let tentativa = 0; tentativa < 30 && !codigo; tentativa++) {
    const caixa = await (await fetch(`${ms}/_ministack/ses/messages`)).json();
    const mensagens = Object.values(caixa.messages || {})
      .flat()
      .filter((m) => (m.To || []).includes(emailBruno));
    codigo = JSON.stringify(mensagens).match(/ViajaJunto: (\d{6})/)?.[1];
    if (!codigo) await esperar(500);
  }
  assert.ok(codigo, 'E-mail nao chegou; confira se o worker esta healthy');
  mostrar({ emailRecebidoNoSES: emailBruno, codigo });
  const verificacao = await api('POST', '/auth/verificar-codigo', null, {
    email: emailBruno,
    codigo,
  });
  mostrar(
    await api('POST', '/auth/redefinir-senha', null, {
      tokenTroca: verificacao.tokenTroca,
      novaSenha,
      confirmarNovaSenha: novaSenha,
    }),
  );
  mostrar(await api('GET', '/usuarios/eu', b, null, 401));
  const novoLogin = await api('POST', '/auth/login', null, { email: emailBruno, senha: novaSenha });
  mostrar({ loginComNovaSenha: 'sucesso', usuario: novoLogin.usuario.nome });

  await etapa('12. Contrato e resultado', '3:50-4:00');
  const contrato = await (await fetch(`${base}/api/docs-json`)).json();
  const operacoes = Object.values(contrato.paths).reduce(
    (n, path) =>
      n +
      Object.keys(path).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)).length,
    0,
  );
  mostrar({
    chamadasValidadas: chamadas,
    contrato: contrato.info.title,
    operacoes,
    swagger: `${base}/api/docs`,
    resultado: 'Fluxo concluido com sucesso',
  });

  if (limpar) {
    console.log('\nRemovendo somente os dados criados por esta execucao...');
    await api('DELETE', url, a, null, 204);
    await api('DELETE', `/atividades/${comFoto.id}`, novoLogin.accessToken, null, 204);
    await api('DELETE', `/atividades/${lugar.id}/avaliacoes/minha`, a, null, 204);
    if (lugar.criadoPor === bruno.usuario.id)
      await api('DELETE', `/atividades/${lugar.id}`, novoLogin.accessToken, null, 204);
    if (cidade.criadoPor === ana.usuario.id)
      await api('DELETE', `/destinos/${cidade.id}`, a, null, 204);
    await api('POST', '/usuarios/eu/exclusao', a, { senha }, 204);
    await api('POST', '/usuarios/eu/exclusao', novoLogin.accessToken, { senha: novaSenha }, 204);
  }
} catch (erro) {
  console.error('\nDemo interrompida:', erro.message);
  process.exitCode = 1;
} finally {
  terminal.close();
}
