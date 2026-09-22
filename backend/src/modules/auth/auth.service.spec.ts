import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

/**
 * Testes unitarios do AuthService (RF01 e RF02).
 * Valida os fluxos de login, logout e registro com dependencias mockadas.
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    usuario: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let jwtService: {
    sign: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  const usuarioMock = {
    id: 1,
    nome: 'Teste Silva',
    email: 'teste@example.com',
    senhaHash: '',
  };

  beforeAll(async () => {
    usuarioMock.senhaHash = await bcrypt.hash('senhaCorreta123', 10);
  });

  beforeEach(async () => {
    prisma = {
      usuario: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mocked.jwt.token'),
    };

    configService = {
      get: jest.fn((chave: string) => {
        if (chave === 'seguranca.saltRounds') return 10;
        if (chave === 'jwt.segredo') return 'test-secret';
        if (chave === 'jwt.expiraEm') return '7d';
        return null;
      }),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = modulo.get<AuthService>(AuthService);
  });

  describe('RF02 - login', () => {
    it('deve autenticar o usuario com credenciais validas e retornar token JWT e dados do usuario', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioMock);

      const resultado = await service.login({
        email: '  TESTE@example.com  ',
        senha: 'senhaCorreta123',
      });

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'teste@example.com' },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 1,
        email: 'teste@example.com',
      });
      expect(resultado).toEqual({
        accessToken: 'mocked.jwt.token',
        usuario: {
          id: 1,
          nome: 'Teste Silva',
          email: 'teste@example.com',
        },
      });
    });

    it('deve lancar UnauthorizedException quando o usuario nao for encontrado', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'inexistente@example.com',
          senha: 'senhaQualquer',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando a senha estiver incorreta', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioMock);

      await expect(
        service.login({
          email: 'teste@example.com',
          senha: 'senhaErrada',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('RF02 - logout', () => {
    it('deve retornar mensagem de confirmacao de encerramento de sessao', async () => {
      const resultado = await service.logout(1);

      expect(resultado).toEqual({
        mensagem: 'Logout realizado com sucesso',
      });
    });
  });

  describe('RF01 - registrar', () => {
    it('deve registrar um novo usuario com sucesso', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.usuario.create.mockResolvedValue({
        id: 2,
        nome: 'Novo Usuario',
        email: 'novo@example.com',
      });

      const resultado = await service.registrar({
        nome: 'Novo Usuario',
        email: 'novo@example.com',
        senha: 'senhaSegura123',
      });

      expect(resultado).toEqual({
        accessToken: 'mocked.jwt.token',
        usuario: {
          id: 2,
          nome: 'Novo Usuario',
          email: 'novo@example.com',
        },
      });
    });

    it('deve lancar ConflictException se o email ja estiver cadastrado', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        service.registrar({
          nome: 'Outro Nome',
          email: 'teste@example.com',
          senha: 'senhaSegura123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
