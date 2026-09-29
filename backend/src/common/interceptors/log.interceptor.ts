import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/** Log de acesso simples: metodo, rota e tempo de resposta (apoia o RNF02). */
@Injectable()
export class LogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const requisicao = contexto.switchToHttp().getRequest();
    const inicio = Date.now();

    return proximo
      .handle()
      .pipe(
        tap(() =>
          this.logger.log(
            `${requisicao.method} ${requisicao.originalUrl} - ${Date.now() - inicio}ms`,
          ),
        ),
      );
  }
}
