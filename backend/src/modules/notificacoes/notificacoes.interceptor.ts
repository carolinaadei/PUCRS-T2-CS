import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { NotificacoesService, TipoNotificacao } from './notificacoes.service';

interface RequisicaoViagem {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: { viagemId?: string };
  user?: { id?: number };
}

/**
 * Emite notificacoes in-app automaticamente quando alteracoes relevantes sao
 * feitas nos destinos, atividades, orcamento ou dados gerais de uma viagem,
 * mantendo o modulo desacoplado dos demais servicos.
 */
@Injectable()
export class NotificacoesInterceptor implements NestInterceptor {
  constructor(private readonly notificacoesService: NotificacoesService) {}

  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoViagem>();

    return proximo.handle().pipe(
      mergeMap(async (resposta: unknown) => {
        await this.registrarSeRelevante(requisicao, resposta);
        return resposta;
      }),
    );
  }

  private async registrarSeRelevante(
    requisicao: RequisicaoViagem | undefined,
    resposta: unknown,
  ): Promise<void> {
    const metodo = requisicao?.method;
    const viagemId = requisicao?.params?.viagemId;

    if (!metodo || !viagemId || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(metodo)) {
      return;
    }

    const caminho = (requisicao.originalUrl ?? requisicao.url ?? '').split('?')[0];
    if (caminho.includes('/membros')) {
      return;
    }

    const alteracao = this.descreverAlteracao(metodo, caminho, resposta);
    if (!alteracao) {
      return;
    }

    try {
      await this.notificacoesService.notificarAlteracaoViagem({
        viagemId,
        autorId: requisicao.user?.id,
        tipo: alteracao.tipo,
        mensagem: alteracao.mensagem,
      });
    } catch {
      // Falha ao registrar notificacao nao interrompe a operacao principal.
    }
  }

  descreverAlteracao(
    metodo: string,
    caminho: string,
    resposta: unknown,
  ): { tipo: TipoNotificacao; mensagem: string } | null {
    if (caminho.includes('/destinos')) {
      return this.descreverAlteracaoDestino(metodo, resposta);
    }

    if (caminho.includes('/atividades')) {
      return this.descreverAlteracaoAtividade(metodo, resposta);
    }

    if (caminho.includes('/orcamento')) {
      return this.descreverAlteracaoOrcamento(metodo, resposta);
    }

    if (metodo === 'PATCH') {
      const nome = this.extrairCampoTexto(resposta, ['nome']);
      return {
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: nome
          ? `As informacoes da viagem ${nome} foram atualizadas`
          : 'As informacoes da viagem foram atualizadas',
      };
    }

    return null;
  }

  private descreverAlteracaoDestino(
    metodo: string,
    resposta: unknown,
  ): { tipo: TipoNotificacao; mensagem: string } | null {
    const nome = this.extrairCampoTexto(resposta, ['destinoCatalogo', 'nome']);

    if (metodo === 'POST') {
      return {
        tipo: TipoNotificacao.DESTINO_ADICIONADO,
        mensagem: nome
          ? `Destino ${nome} adicionado ao roteiro da viagem`
          : 'Novo destino adicionado ao roteiro da viagem',
      };
    }

    if (metodo === 'PATCH') {
      return {
        tipo: TipoNotificacao.DESTINO_ATUALIZADO,
        mensagem: nome
          ? `Destino ${nome} atualizado no roteiro da viagem`
          : 'Destino atualizado no roteiro da viagem',
      };
    }

    if (metodo === 'DELETE') {
      return {
        tipo: TipoNotificacao.DESTINO_REMOVIDO,
        mensagem: 'Um destino foi removido do roteiro da viagem',
      };
    }

    return null;
  }

  private descreverAlteracaoAtividade(
    metodo: string,
    resposta: unknown,
  ): { tipo: TipoNotificacao; mensagem: string } | null {
    const nome = this.extrairCampoTexto(resposta, ['catalogoAtividade', 'nome']);

    if (metodo === 'POST') {
      return {
        tipo: TipoNotificacao.ATIVIDADE_ADICIONADA,
        mensagem: nome
          ? `Atividade ${nome} adicionada ao roteiro da viagem`
          : 'Nova atividade adicionada ao roteiro da viagem',
      };
    }

    if (metodo === 'PATCH') {
      return {
        tipo: TipoNotificacao.ATIVIDADE_ATUALIZADA,
        mensagem: nome
          ? `Atividade ${nome} atualizada na viagem`
          : 'Atividade atualizada na viagem',
      };
    }

    if (metodo === 'DELETE') {
      return {
        tipo: TipoNotificacao.ATIVIDADE_REMOVIDA,
        mensagem: 'Uma atividade foi removida da viagem',
      };
    }

    return null;
  }

  private descreverAlteracaoOrcamento(
    metodo: string,
    resposta: unknown,
  ): { tipo: TipoNotificacao; mensagem: string } | null {
    if (metodo === 'PUT') {
      const valor = this.extrairCampoTexto(resposta, ['valorTotal']);
      return {
        tipo: TipoNotificacao.ORCAMENTO_ATUALIZADO,
        mensagem: valor
          ? `Orcamento da viagem definido em ${valor}`
          : 'Orcamento da viagem atualizado',
      };
    }

    if (metodo === 'DELETE') {
      return {
        tipo: TipoNotificacao.ORCAMENTO_REMOVIDO,
        mensagem: 'O orcamento da viagem foi removido',
      };
    }

    return null;
  }

  private extrairCampoTexto(objeto: unknown, caminho: string[]): string | null {
    let atual: unknown = objeto;
    for (const chave of caminho) {
      if (!atual || typeof atual !== 'object') {
        return null;
      }
      atual = (atual as Record<string, unknown>)[chave];
    }

    if (typeof atual === 'string' && atual.trim().length > 0) {
      return atual.trim();
    }
    if (typeof atual === 'number') {
      return String(atual);
    }

    return null;
  }
}
