import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoriaDestino, Prisma, TipoAtividade } from '@prisma/client';
import { CodigoErro } from '../common/erros/codigos-erro';
import { indisponivel, naoEncontrado, requisicaoInvalida } from '../common/erros/erros';
import {
  CONTAR_AVALIACOES,
  paraCatalogoAtividadeDto,
} from '../modules/atividades/atividades.mapper';
import { paraDestinoCatalogoDto } from '../modules/destinos/destinos.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { AtribuicaoDto, BuscarCidadesDto, BuscarLugaresDto, LugarExternoDto } from './geoapify.dto';

const CATEGORIAS: Record<TipoAtividade, string> = {
  PASSEIO: 'tourism',
  REFEICAO: 'catering',
  HOSPEDAGEM: 'accommodation',
  TRANSPORTE: 'public_transport',
  OUTRO: 'leisure',
};
const identidade = (idExterno: string) => ({ fonte_idExterno: { fonte: 'geoapify', idExterno } });
const objeto = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

@Injectable()
export class GeoapifyService {
  private readonly cache = new Map<string, { ate: number; itens: LugarExternoDto[] }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  cidades(dto: BuscarCidadesDto) {
    return this.consultar(
      dto.autocompletar === 'true' ? '/v1/geocode/autocomplete' : '/v1/geocode/search',
      {
        text: dto.busca,
        type: 'city',
        limit: String(dto.limite),
        ...(dto.pais ? { filter: `countrycode:${dto.pais.toLowerCase()}` } : {}),
      },
    );
  }

  atividades(dto: BuscarLugaresDto) {
    return this.consultar('/v2/places', {
      categories: CATEGORIAS[dto.tipoAtividade],
      filter: `circle:${dto.longitude},${dto.latitude},${dto.raio}`,
      bias: `proximity:${dto.longitude},${dto.latitude}`,
      limit: String(dto.limite),
    });
  }

  async importarAtividade(idExterno: string, usuarioId: number) {
    const existente = await this.prisma.catalogoAtividade.findUnique({
      where: identidade(idExterno),
      include: CONTAR_AVALIACOES,
    });
    if (existente) return paraCatalogoAtividadeDto(existente);
    const lugar = await this.detalhar(idExterno);
    const dados = {
      ...this.origem(lugar),
      nome: lugar.nome.slice(0, 180),
      tipoAtividade: lugar.tipoAtividade,
      local: lugar.local?.slice(0, 255),
      cidade: lugar.cidade?.slice(0, 120),
      pais: lugar.pais?.slice(0, 80),
      latitude: lugar.latitude,
      longitude: lugar.longitude,
      criadoPor: usuarioId,
    };
    const where = identidade(dados.idExterno);
    const item = await this.gravarSemDuplicar(
      () =>
        this.prisma.catalogoAtividade.upsert({
          where,
          create: dados,
          update: {},
          include: CONTAR_AVALIACOES,
        }),
      () => this.prisma.catalogoAtividade.findUniqueOrThrow({ where, include: CONTAR_AVALIACOES }),
    );
    return paraCatalogoAtividadeDto(item);
  }

  async importarDestino(idExterno: string, usuarioId: number) {
    const existente = await this.prisma.destinoCatalogo.findUnique({
      where: identidade(idExterno),
    });
    if (existente) return paraDestinoCatalogoDto(existente);
    const lugar = await this.detalhar(idExterno);
    if (!lugar.ehCidade || !lugar.pais)
      throw requisicaoInvalida(
        CodigoErro.LUGAR_INVALIDO,
        'Escolha uma cidade com pais para importar como destino',
      );
    const dados = {
      ...this.origem(lugar),
      nome: lugar.nome.slice(0, 120),
      pais: lugar.pais.slice(0, 80),
      categoria: CategoriaDestino.CIDADE,
      latitude: lugar.latitude,
      longitude: lugar.longitude,
      criadoPor: usuarioId,
    };
    const where = identidade(dados.idExterno);
    return paraDestinoCatalogoDto(
      await this.gravarSemDuplicar(
        () => this.prisma.destinoCatalogo.upsert({ where, create: dados, update: {} }),
        () => this.prisma.destinoCatalogo.findUniqueOrThrow({ where }),
      ),
    );
  }

  private origem(lugar: LugarExternoDto) {
    return {
      fonte: 'geoapify',
      idExterno: lugar.idExterno!,
      codigoPais: lugar.codigoPais,
      atribuicoes: lugar.atribuicoes.map((a) => ({ texto: a.texto, url: a.url })),
    };
  }

  private async gravarSemDuplicar<T>(
    gravar: () => Promise<T>,
    reler: () => Promise<T>,
  ): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      // Upserts simultaneos com include podem disputar o mesmo indice unico.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002')
        return reler();
      throw erro;
    }
  }

  private async detalhar(id: string): Promise<LugarExternoDto> {
    const itens = await this.consultar('/v2/place-details', { id, features: 'details' });
    // A Geoapify pode canonizar o place_id recebido na busca.
    if (!itens[0])
      throw naoEncontrado(CodigoErro.LUGAR_NAO_ENCONTRADO, 'Lugar externo nao encontrado');
    return itens[0];
  }

  private async consultar(
    caminho: string,
    parametros: Record<string, string>,
  ): Promise<LugarExternoDto[]> {
    const chave = this.config.get<string>('geoapify.apiKey');
    if (!chave)
      throw indisponivel(
        CodigoErro.GEOAPIFY_INDISPONIVEL,
        'Configure GEOAPIFY_API_KEY no servidor',
      );
    const query = new URLSearchParams({ ...parametros, lang: 'pt' });
    const cacheKey = caminho + '?' + query.toString();
    const salvo = this.cache.get(cacheKey);
    if (salvo && salvo.ate > Date.now()) return structuredClone(salvo.itens);
    query.set('apiKey', chave);
    let dados: unknown;
    try {
      const resposta = await fetch(`https://api.geoapify.com${caminho}?${query}`, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (resposta.status === 429)
        throw indisponivel(
          CodigoErro.GEOAPIFY_LIMITE,
          'Limite da Geoapify atingido; tente mais tarde',
        );
      if (resposta.status === 404)
        throw naoEncontrado(CodigoErro.LUGAR_NAO_ENCONTRADO, 'Lugar externo nao encontrado');
      if (!resposta.ok)
        throw indisponivel(
          CodigoErro.GEOAPIFY_INDISPONIVEL,
          'Geoapify indisponivel ou chave recusada',
        );
      dados = await resposta.json();
    } catch (erro) {
      if (erro instanceof HttpException) throw erro;
      // Erros de rede podem carregar a URL com a chave: nunca propagar a causa.
      throw indisponivel(CodigoErro.GEOAPIFY_INDISPONIVEL, 'Nao foi possivel consultar a Geoapify');
    }
    const features = objeto(dados).features;
    if (!Array.isArray(features))
      throw indisponivel(CodigoErro.GEOAPIFY_INDISPONIVEL, 'Resposta invalida da Geoapify');
    const itens = features
      .map((f: unknown) => this.normalizar(f))
      .filter((f): f is LugarExternoDto => f !== null);
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(cacheKey, { ate: Date.now() + 300_000, itens });
    return structuredClone(itens);
  }

  private normalizar(feature: unknown): LugarExternoDto | null {
    const p = objeto(objeto(feature).properties);
    const id = texto(p.place_id);
    const nome = texto(p.name) ?? texto(p.city) ?? texto(p.address_line1);
    if (
      !id ||
      id.length > 2048 ||
      !nome ||
      typeof p.lat !== 'number' ||
      typeof p.lon !== 'number' ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lon) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lon) > 180
    )
      return null;
    const categorias: unknown[] = Array.isArray(p.categories) ? p.categories : [];
    const tipo =
      (Object.entries(CATEGORIAS) as [TipoAtividade, string][]).find(([, categoria]) =>
        categorias.some(
          (c) => typeof c === 'string' && (c === categoria || c.startsWith(categoria + '.')),
        ),
      )?.[0] ?? TipoAtividade.OUTRO;
    const codigo = texto(p.country_code)?.toUpperCase();
    const atribuicoes: AtribuicaoDto[] = [
      { texto: 'Powered by Geoapify', url: 'https://www.geoapify.com/' },
      { texto: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
    ];
    const origem = objeto(p.datasource);
    const credito = texto(origem.attribution);
    const url = texto(origem.url);
    if (
      credito &&
      url &&
      /^https?:\/\//.test(url) &&
      !atribuicoes.some((a) => a.texto === credito)
    ) {
      atribuicoes.push({ texto: credito.slice(0, 500), url: url.slice(0, 2048) });
    }
    return {
      fonte: 'geoapify',
      idExterno: id,
      nome,
      local: texto(p.formatted),
      cidade: texto(p.city) ?? texto(p.town) ?? texto(p.village),
      pais: texto(p.country),
      codigoPais: codigo && /^[A-Z]{2}$/.test(codigo) ? codigo : null,
      latitude: p.lat,
      longitude: p.lon,
      tipoAtividade: tipo,
      atribuicoes,
      ehCidade: p.result_type === 'city' || categorias.includes('administrative.city_level'),
    };
  }
}
