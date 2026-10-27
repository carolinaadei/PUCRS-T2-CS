/**
 * Conversao de nomes de paises (em portugues, ingles ou sigla ISO) para o
 * codigo ISO 3166-1 alfa-2 exigido pelo jsVectormap (RF11).
 */

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const APELIDOS_PAISES: Record<string, string> = {
  eua: 'US',
  'estados unidos': 'US',
  'estados unidos da america': 'US',
  usa: 'US',
  inglaterra: 'GB',
  escocia: 'GB',
  'pais de gales': 'GB',
  'irlanda do norte': 'GB',
  'reino unido': 'GB',
  uk: 'GB',
  holanda: 'NL',
  'paises baixos': 'NL',
  chequia: 'CZ',
  'republica tcheca': 'CZ',
  'coreia do sul': 'KR',
  'emirados arabes': 'AE',
  'emirados arabes unidos': 'AE',
};

const nomesPt = new Intl.DisplayNames(['pt-BR', 'pt'], { type: 'region', fallback: 'none' });
const nomesEn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

const MAPA_NOME_PARA_ISO = new Map<string, string>();
const CODIGOS_VALIDOS = new Set<string>();

for (let c1 = 65; c1 <= 90; c1++) {
  for (let c2 = 65; c2 <= 90; c2++) {
    const codigo = String.fromCharCode(c1, c2);
    const nomePt = nomesPt.of(codigo);

    if (nomePt && nomePt !== codigo) {
      CODIGOS_VALIDOS.add(codigo);
      const chavePt = normalizar(nomePt);
      if (!MAPA_NOME_PARA_ISO.has(chavePt)) {
        MAPA_NOME_PARA_ISO.set(chavePt, codigo);
      }
    }

    const nomeEn = nomesEn.of(codigo);
    if (nomeEn && nomeEn !== codigo) {
      CODIGOS_VALIDOS.add(codigo);
      const chaveEn = normalizar(nomeEn);
      if (!MAPA_NOME_PARA_ISO.has(chaveEn)) {
        MAPA_NOME_PARA_ISO.set(chaveEn, codigo);
      }
    }
  }
}

for (const [apelido, codigo] of Object.entries(APELIDOS_PAISES)) {
  MAPA_NOME_PARA_ISO.set(apelido, codigo);
}

export interface PaisResolvido {
  codigo: string;
  nome: string;
}

/**
 * Resolve o campo `pais` do catalogo de destinos para `{ codigo, nome }` no
 * padrao ISO 3166-1 alfa-2. Retorna `null` quando vazio ou irreconhecivel.
 */
export function resolverPaisIso(pais?: string | null): PaisResolvido | null {
  const limpo = pais?.trim();
  if (!limpo) {
    return null;
  }

  if (/^[a-zA-Z]{2}$/.test(limpo)) {
    const sigla = limpo.toUpperCase();
    if (!CODIGOS_VALIDOS.has(sigla)) {
      return null;
    }

    return {
      codigo: sigla,
      nome: nomesPt.of(sigla) ?? sigla,
    };
  }

  const codigo = MAPA_NOME_PARA_ISO.get(normalizar(limpo));
  if (!codigo) {
    return null;
  }

  return {
    codigo,
    nome: limpo,
  };
}
