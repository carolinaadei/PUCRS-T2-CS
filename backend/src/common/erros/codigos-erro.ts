/**
 * Codigos estaveis devolvidos no campo `codigo` de toda resposta de erro.
 *
 * O texto de `mensagem` e para gente ler e pode mudar a qualquer momento; o
 * codigo e contrato. Um front deve decidir o que fazer olhando so para ele.
 */
export const CodigoErro = {
  // Genericos
  VALIDACAO: 'VALIDACAO',
  ID_INVALIDO: 'ID_INVALIDO',
  JSON_INVALIDO: 'JSON_INVALIDO',
  CORPO_INVALIDO: 'CORPO_INVALIDO',
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  SESSAO_ENCERRADA: 'SESSAO_ENCERRADA',
  PROIBIDO: 'PROIBIDO',
  NAO_ENCONTRADO: 'NAO_ENCONTRADO',
  ROTA_NAO_ENCONTRADA: 'ROTA_NAO_ENCONTRADA',
  CONFLITO: 'CONFLITO',
  REGISTRO_DUPLICADO: 'REGISTRO_DUPLICADO',
  REGISTRO_EM_USO: 'REGISTRO_EM_USO',
  CORPO_GRANDE_DEMAIS: 'CORPO_GRANDE_DEMAIS',
  MUITAS_REQUISICOES: 'MUITAS_REQUISICOES',
  SERVICO_INDISPONIVEL: 'SERVICO_INDISPONIVEL',
  ERRO_INTERNO: 'ERRO_INTERNO',

  // Conta e sessao
  EMAIL_JA_CADASTRADO: 'EMAIL_JA_CADASTRADO',
  CREDENCIAIS_INVALIDAS: 'CREDENCIAIS_INVALIDAS',
  REFRESH_TOKEN_INVALIDO: 'REFRESH_TOKEN_INVALIDO',
  SENHA_ATUAL_INCORRETA: 'SENHA_ATUAL_INCORRETA',
  SENHAS_DIVERGENTES: 'SENHAS_DIVERGENTES',
  CODIGO_RECUPERACAO_INVALIDO: 'CODIGO_RECUPERACAO_INVALIDO',
  TOKEN_TROCA_INVALIDO: 'TOKEN_TROCA_INVALIDO',
  USUARIO_NAO_ENCONTRADO: 'USUARIO_NAO_ENCONTRADO',

  // Viagens e colaboracao
  VIAGEM_NAO_ENCONTRADA: 'VIAGEM_NAO_ENCONTRADA',
  SOMENTE_LEITURA: 'SOMENTE_LEITURA',
  APENAS_CRIADOR: 'APENAS_CRIADOR',
  PERIODO_INVALIDO: 'PERIODO_INVALIDO',
  DATA_INEXISTENTE: 'DATA_INEXISTENTE',
  DESTINOS_FORA_DO_PERIODO: 'DESTINOS_FORA_DO_PERIODO',
  CONVITE_INVALIDO: 'CONVITE_INVALIDO',
  JA_PARTICIPA: 'JA_PARTICIPA',
  CRIADOR_NAO_SAI: 'CRIADOR_NAO_SAI',
  MEMBRO_NAO_ENCONTRADO: 'MEMBRO_NAO_ENCONTRADO',

  // Destinos e atividades
  DESTINO_CATALOGO_NAO_ENCONTRADO: 'DESTINO_CATALOGO_NAO_ENCONTRADO',
  DESTINO_NAO_ENCONTRADO: 'DESTINO_NAO_ENCONTRADO',
  DESTINO_DE_OUTRA_VIAGEM: 'DESTINO_DE_OUTRA_VIAGEM',
  DESTINO_FORA_DO_PERIODO: 'DESTINO_FORA_DO_PERIODO',
  ORDEM_INVALIDA: 'ORDEM_INVALIDA',
  ATIVIDADE_CATALOGO_NAO_ENCONTRADA: 'ATIVIDADE_CATALOGO_NAO_ENCONTRADA',
  ATIVIDADE_NAO_ENCONTRADA: 'ATIVIDADE_NAO_ENCONTRADA',
  APENAS_QUEM_CADASTROU: 'APENAS_QUEM_CADASTROU',
  CATALOGO_EM_USO: 'CATALOGO_EM_USO',

  GEOAPIFY_INDISPONIVEL: 'GEOAPIFY_INDISPONIVEL',
  GEOAPIFY_LIMITE: 'GEOAPIFY_LIMITE',
  LUGAR_NAO_ENCONTRADO: 'LUGAR_NAO_ENCONTRADO',
  LUGAR_INVALIDO: 'LUGAR_INVALIDO',

  // Orcamento, avaliacoes, notificacoes e uploads
  ORCAMENTO_NAO_DEFINIDO: 'ORCAMENTO_NAO_DEFINIDO',
  AVALIACAO_NAO_ENCONTRADA: 'AVALIACAO_NAO_ENCONTRADA',
  ATIVIDADE_NAO_REALIZADA: 'ATIVIDADE_NAO_REALIZADA',
  NOTIFICACAO_NAO_ENCONTRADA: 'NOTIFICACAO_NAO_ENCONTRADA',
  UPLOAD_INDISPONIVEL: 'UPLOAD_INDISPONIVEL',
} as const;

export type CodigoErro = (typeof CodigoErro)[keyof typeof CodigoErro];

/** Quando cada codigo aparece. Vira a tabela de erros da pagina do Swagger. */
export const DESCRICAO_CODIGO_ERRO: Record<CodigoErro, string> = {
  VALIDACAO: 'Corpo, query ou parametro fora do formato. `detalhes` lista os campos.',
  ID_INVALIDO: 'Parametro de rota que deveria ser um id inteiro positivo.',
  JSON_INVALIDO: 'O corpo enviado nao e um JSON valido.',
  CORPO_INVALIDO:
    'Corpo ilegivel: charset ou compressao nao suportados, ou envio interrompido (400/415).',
  NAO_AUTENTICADO: 'Token de acesso ausente, invalido ou expirado.',
  SESSAO_ENCERRADA:
    'Token de acesso invalidado por DELETE /usuarios/eu/sessoes, troca ou redefinicao de senha. ' +
    'POST /auth/logout revoga apenas o refresh token informado; o access token continua valido ate expirar.',
  PROIBIDO: 'Autenticado, mas sem permissao para a operacao.',
  NAO_ENCONTRADO: 'Recurso inexistente.',
  ROTA_NAO_ENCONTRADA: 'Metodo + caminho que nao existem na API.',
  CONFLITO: 'A operacao conflita com o estado atual do recurso.',
  REGISTRO_DUPLICADO: 'Ja existe um registro com estes dados.',
  REGISTRO_EM_USO: 'O registro e referenciado por outros dados e nao pode ser removido.',
  CORPO_GRANDE_DEMAIS: 'O corpo da requisicao passou do limite de 100 KB.',
  MUITAS_REQUISICOES: 'Limite de requisicoes estourado; aguarde e tente de novo.',
  SERVICO_INDISPONIVEL: 'Dependencia externa fora do ar.',
  ERRO_INTERNO: 'Falha inesperada. Informe o `requestId` ao reportar.',
  EMAIL_JA_CADASTRADO: 'Ja existe uma conta com este e-mail.',
  CREDENCIAIS_INVALIDAS: 'E-mail ou senha incorretos.',
  REFRESH_TOKEN_INVALIDO: 'Refresh token inexistente, expirado, revogado ou ja usado.',
  SENHA_ATUAL_INCORRETA: 'A senha atual informada nao confere.',
  SENHAS_DIVERGENTES: 'A confirmacao nao confere com a nova senha.',
  CODIGO_RECUPERACAO_INVALIDO: 'Codigo de recuperacao errado, expirado, usado ou queimado.',
  TOKEN_TROCA_INVALIDO: 'Token de troca de senha invalido, usado ou expirado.',
  USUARIO_NAO_ENCONTRADO: 'A conta do token nao existe mais.',
  VIAGEM_NAO_ENCONTRADA: 'A viagem nao existe ou voce nao participa dela.',
  SOMENTE_LEITURA: 'Voce participa da viagem como VISUALIZADOR.',
  APENAS_CRIADOR: 'Operacao reservada ao criador da viagem.',
  PERIODO_INVALIDO: 'Datas de inicio e fim incoerentes.',
  DATA_INEXISTENTE: 'Data que nao existe no calendario (ex.: 2027-02-31).',
  DESTINOS_FORA_DO_PERIODO: 'O novo periodo da viagem deixaria destinos de fora.',
  CONVITE_INVALIDO: 'Codigo de convite inexistente ou ja substituido.',
  JA_PARTICIPA: 'O usuario ja e criador ou colaborador da viagem.',
  CRIADOR_NAO_SAI: 'O criador nao sai da viagem; ele a exclui.',
  MEMBRO_NAO_ENCONTRADO: 'Colaborador inexistente nesta viagem.',
  DESTINO_CATALOGO_NAO_ENCONTRADO: 'Destino inexistente no catalogo.',
  DESTINO_NAO_ENCONTRADO: 'Destino inexistente nesta viagem.',
  DESTINO_DE_OUTRA_VIAGEM: 'O destino informado pertence a outra viagem.',
  DESTINO_FORA_DO_PERIODO: 'Chegada ou saida fora das datas da viagem, ou saida antes da chegada.',
  ORDEM_INVALIDA: 'A lista de reordenacao nao corresponde aos destinos da viagem.',
  ATIVIDADE_CATALOGO_NAO_ENCONTRADA: 'Atividade inexistente no catalogo.',
  ATIVIDADE_NAO_ENCONTRADA: 'Atividade inexistente nesta viagem.',
  APENAS_QUEM_CADASTROU: 'So quem cadastrou o item do catalogo pode altera-lo ou exclui-lo.',
  CATALOGO_EM_USO: 'O item do catalogo esta em viagens ou tem avaliacoes de outras pessoas.',
  ORCAMENTO_NAO_DEFINIDO: 'A viagem ainda nao tem orcamento.',
  AVALIACAO_NAO_ENCONTRADA: 'Voce ainda nao avaliou esta atividade.',
  ATIVIDADE_NAO_REALIZADA: 'So avalia quem tem a atividade concluida numa viagem de que participa.',
  NOTIFICACAO_NAO_ENCONTRADA: 'Notificacao inexistente ou de outro usuario.',
  GEOAPIFY_INDISPONIVEL:
    'Geoapify sem chave configurada, chave recusada ou fornecedor indisponivel.',
  GEOAPIFY_LIMITE:
    'Limite ou cota da Geoapify atingido. Consulte o catalogo local ou tente mais tarde.',
  LUGAR_NAO_ENCONTRADO: 'Identificador externo nao encontrado na Geoapify.',
  LUGAR_INVALIDO: 'Lugar sem dados necessarios ou nao corresponde a uma cidade.',
  UPLOAD_INDISPONIVEL: 'O armazenamento de arquivos nao esta configurado neste ambiente.',
};
