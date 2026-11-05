import { MembroViagem } from '@prisma/client';
import { MembroDto } from './dto/membro-resposta.dto';

export type MembroComUsuario = MembroViagem & {
  usuario: { id: number; nome: string; email: string };
};

/** Include padrao: os dados do colaborador que os outros participantes podem ver. */
export const INCLUIR_USUARIO = {
  usuario: { select: { id: true, nome: true, email: true } },
} as const;

export const paraMembroDto = (membro: MembroComUsuario): MembroDto => ({
  id: membro.id,
  viagemId: membro.viagemId,
  usuarioId: membro.usuarioId,
  permissao: membro.permissao,
  entrouEm: membro.entrouEm,
  usuario: membro.usuario,
});
