import { SQSClient } from '@aws-sdk/client-sqs';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArmazenamentoService } from './armazenamento.service';
import { FilaEmailsService } from './fila-emails.service';

const config = (aws: Record<string, unknown>) =>
  ({
    get: () => ({ regiao: 'us-east-1', tamanhoMaximoUploadMb: 5, ...aws }),
  }) as unknown as ConfigService;

describe('ArmazenamentoService', () => {
  const credenciais = { ...process.env };

  beforeAll(() => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
  });

  afterAll(() => {
    process.env = credenciais;
  });

  it('sem bucket configurado fica indisponivel e responde UPLOAD_INDISPONIVEL', async () => {
    const servico = new ArmazenamentoService(config({}));

    expect(servico.disponivel).toBe(false);
    await expect(servico.autorizarUpload('destinos', 'image/jpeg')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fora da AWS assina pelo endereco publico, com o bucket no caminho', async () => {
    const servico = new ArmazenamentoService(
      config({
        bucketMidia: 'midia',
        endpoint: 'http://ministack:4566',
        endpointPublicoS3: 'http://localhost:4566/',
      }),
    );

    const upload = await servico.autorizarUpload('destinos', 'image/png');

    expect(upload.url).toBe('http://localhost:4566/midia');
    expect(upload.chave).toMatch(/^publico\/destinos\/[0-9a-f-]{36}\.png$/);
    expect(upload.urlPublica).toBe(`http://localhost:4566/midia/${upload.chave}`);
    expect(upload.campos).toMatchObject({ key: upload.chave, 'Content-Type': 'image/png' });
    expect(upload.tamanhoMaximoBytes).toBe(5 * 1024 * 1024);

    // A politica assinada fixa tamanho e tipo: e o S3 quem recusa o resto.
    const politica = JSON.parse(Buffer.from(upload.campos.Policy, 'base64').toString()) as {
      conditions: unknown[];
    };
    expect(politica.conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 5 * 1024 * 1024],
        ['eq', '$Content-Type', 'image/png'],
      ]),
    );
  });

  it('na AWS usa o endereco virtual-hosted do bucket', async () => {
    const servico = new ArmazenamentoService(config({ bucketMidia: 'midia' }));

    const upload = await servico.autorizarUpload('atividades', 'image/webp');

    expect(upload.urlPublica).toBe(`https://midia.s3.us-east-1.amazonaws.com/${upload.chave}`);
  });
});

describe('FilaEmailsService', () => {
  let enviar: jest.SpyInstance;

  beforeEach(() => {
    enviar = jest.spyOn(SQSClient.prototype, 'send');
  });

  afterEach(() => jest.restoreAllMocks());

  const mensagem = { para: { email: 'a@b.com' }, assunto: 'Oi', html: '<p>oi</p>', texto: 'oi' };

  it('sem SQS_FILA_EMAILS fica inativa', () => {
    expect(new FilaEmailsService(config({})).ativa).toBe(false);
  });

  it('resolve a URL pelo nome uma unica vez e publica o e-mail como JSON', async () => {
    enviar.mockResolvedValueOnce({ QueueUrl: 'http://ministack:4566/000/emails' } as never);
    enviar.mockResolvedValue({} as never);
    const fila = new FilaEmailsService(
      config({ filaEmails: 'emails', endpoint: 'http://ministack:4566' }),
    );

    await fila.publicar(mensagem);
    await fila.publicar(mensagem);

    const comandos = enviar.mock.calls.map(([comando]) => comando.constructor.name);
    expect(comandos).toEqual(['GetQueueUrlCommand', 'SendMessageCommand', 'SendMessageCommand']);
    expect(JSON.parse(enviar.mock.calls[1][0].input.MessageBody)).toEqual(mensagem);
  });

  it('recebe com long polling, le a tentativa e confirma pelo recibo', async () => {
    enviar.mockResolvedValueOnce({
      Messages: [
        {
          ReceiptHandle: 'r1',
          Body: JSON.stringify(mensagem),
          Attributes: { ApproximateReceiveCount: '2' },
        },
      ],
    } as never);
    enviar.mockResolvedValue({} as never);
    const fila = new FilaEmailsService(config({ filaEmails: 'http://fila/emails' }));

    await expect(fila.receber(1)).resolves.toEqual([{ recibo: 'r1', tentativa: 2, mensagem }]);
    await fila.confirmar('r1');

    expect(enviar.mock.calls[0][0].input).toMatchObject({
      QueueUrl: 'http://fila/emails',
      WaitTimeSeconds: 1,
    });
    expect(enviar.mock.calls[1][0].input).toEqual({
      QueueUrl: 'http://fila/emails',
      ReceiptHandle: 'r1',
    });
  });

  it('nao guarda a falha ao resolver a URL: a proxima chamada tenta de novo', async () => {
    enviar.mockRejectedValueOnce(new Error('fora do ar'));
    enviar.mockResolvedValueOnce({ QueueUrl: 'http://fila/emails' } as never);
    enviar.mockResolvedValue({} as never);
    const fila = new FilaEmailsService(config({ filaEmails: 'emails' }));

    await expect(fila.publicar(mensagem)).rejects.toThrow('fora do ar');
    await expect(fila.publicar(mensagem)).resolves.toBeUndefined();
  });
});
