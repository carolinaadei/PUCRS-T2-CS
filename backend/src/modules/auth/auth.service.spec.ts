import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegistrarDto } from './dto/registrar.dto';

/**
 * RF01 - cadastro de conta. O Prisma e mockado: estes testes cobrem a regra de
 * negocio do service, nao o banco (o caminho real com PostgreSQL fica no e2e).
 */
describe('AuthService - registrar (RF01)', () => {
  const SALT_ROUNDS = 4;
  const TOKEN_FAKE = 'token-jwt-fake';

  let service: AuthService;
  let prisma: { usuario: { findUnique: jest.Mock; create: jest.Mock } };
  let jwt: { sign: jest.Mock };

  const dto = (): RegistrarDto => ({
    nome: '  Ana Souza  ',
    email: '  Ana.Souza@Example.COM  ',
    senha: 'senhaSegura123',
  });

  const dadosPersistidos = () => prisma.usuario.create.mock.calls[0][0].data;

  beforeEach(async () => {
    prisma = { usuario: { findUnique: jest.fn(), create: jest.fn() } };
    jwt = { sign: jest.fn().mockReturnValue(TOKEN_FAKE) };

    const modulo = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(SALT_ROUNDS) } },
      ],
    }).compile();

    service = modulo.get(AuthService);
  });

  it('cria a conta e devolve o token quando o e-mail ainda nao existe', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({
      id: 1,
      nome: 'Ana Souza',
      email: 'ana.souza@example.com',
    });

    const resposta = await service.registrar(dto());

    expect(resposta.accessToken).toBe(TOKEN_FAKE);
    expect(resposta.usuario).toEqual({ id: 1, nome: 'Ana Souza', email: 'ana.souza@example.com' });
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 1, email: 'ana.souza@example.com' });
  });

  it('persiste a senha em hash e nunca em texto puro (RNF03)', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: 1, nome: 'Ana Souza', email: 'a@b.com' });

    await service.registrar(dto());

    const { senhaHash } = dadosPersistidos();
    expect(senhaHash).not.toBe('senhaSegura123');
    expect(senhaHash).toMatch(/^\$2[aby]\$/);

    await expect(bcrypt.compare('senhaSegura123', senhaHash)).resolves.toBe(true);
  });

  it('normaliza o e-mail para minusculas e aplica trim no nome', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: 1, nome: 'Ana Souza', email: 'a@b.com' });

    await service.registrar(dto());

    expect(dadosPersistidos()).toMatchObject({
      nome: 'Ana Souza',
      email: 'ana.souza@example.com',
    });

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: 'ana.souza@example.com' },
      select: { id: true },
    });
  });

  it('nao expoe o hash da senha na resposta', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: 1, nome: 'Ana Souza', email: 'a@b.com' });

    const resposta = await service.registrar(dto());

    expect(JSON.stringify(resposta)).not.toContain('senhaHash');
    expect(dadosPersistidos().senhaHash).toBeDefined();

    expect(prisma.usuario.create.mock.calls[0][0].select).toEqual({
      id: true,
      nome: true,
      email: true,
    });
  });

  it('rejeita e-mail ja cadastrado sem tentar gravar', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 9 });

    await expect(service.registrar(dto())).rejects.toThrow(ConflictException);
    await expect(service.registrar(dto())).rejects.toThrow('Ja existe uma conta com este e-mail');
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('traduz o P2002 da corrida para o mesmo conflito do caminho sequencial', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'teste',
        meta: { target: ['email'] },
      }),
    );

    await expect(service.registrar(dto())).rejects.toThrow(ConflictException);
    await expect(service.registrar(dto())).rejects.toThrow('Ja existe uma conta com este e-mail');
  });

  it('relanca erros que nao sejam de duplicidade', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Banco indisponivel', {
        code: 'P1001',
        clientVersion: 'teste',
      }),
    );

    await expect(service.registrar(dto())).rejects.toThrow('Banco indisponivel');
    await expect(service.registrar(dto())).rejects.not.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService - login (RF02)', () => {
  let service: AuthService;
  let prisma: { usuario: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { usuario: { findUnique: jest.fn() } };

    const modulo = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('token') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(4) } },
      ],
    }).compile();

    service = modulo.get(AuthService);
  });

  it('autentica quando a senha confere com o hash gravado no cadastro', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 1,
      nome: 'Ana Souza',
      email: 'ana.souza@example.com',
      senhaHash: await bcrypt.hash('senhaSegura123', 4),
    });

    const resposta = await service.login({
      email: 'ana.souza@example.com',
      senha: 'senhaSegura123',
    });

    expect(resposta.accessToken).toBe('token');
    expect(JSON.stringify(resposta)).not.toContain('senhaHash');
  });

  it('usa a mesma mensagem para e-mail inexistente e senha errada', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'x@y.com', senha: 'seja-la-o-que-for' })).rejects.toThrow(
      'E-mail ou senha invalidos',
    );

    prisma.usuario.findUnique.mockResolvedValue({
      id: 1,
      nome: 'Ana',
      email: 'x@y.com',
      senhaHash: await bcrypt.hash('a-senha-certa', 4),
    });

    await expect(service.login({ email: 'x@y.com', senha: 'a-senha-errada' })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
