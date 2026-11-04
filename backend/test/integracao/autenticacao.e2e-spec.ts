import { AppDeTeste, bearer, comBanco, criarApp, limparBanco, registrar } from '../apoio/app';

/** Cadastro, login, sessoes com refresh token, recuperacao e conta - contra o banco real. */
comBanco('Autenticacao e conta (integracao)', () => {
  let t: AppDeTeste;

  beforeAll(async () => {
    t = await criarApp();
    await limparBanco(t.app);
  });

  afterAll(async () => {
    await limparBanco(t.app);
    await t.app.close();
  });

  describe('cadastro e login', () => {
    it('cadastra, normaliza o e-mail e devolve o par de tokens', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/auth/registrar')
        .send({ nome: '  Ana Souza  ', email: 'Ana@Teste.com', senha: 'senhaSegura123' })
        .expect(201);

      expect(body).toMatchObject({
        tipoToken: 'Bearer',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        usuario: { nome: 'Ana Souza', email: 'ana@teste.com' },
      });
      expect(new Date(body.accessTokenExpiraEm).getTime()).toBeGreaterThan(Date.now());
      expect(JSON.stringify(body)).not.toContain('senhaHash');
    });

    it('recusa e-mail repetido com EMAIL_JA_CADASTRADO', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/auth/registrar')
        .send({ nome: 'Outra Ana', email: 'ANA@teste.com', senha: 'senhaSegura123' })
        .expect(409);

      expect(body.codigo).toBe('EMAIL_JA_CADASTRADO');
    });

    it('lista os campos invalidos no corpo de erro', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/auth/registrar')
        .send({ nome: '', email: 'nao-e-email', senha: '123', admin: true })
        .expect(400);

      expect(body.codigo).toBe('VALIDACAO');
      expect(body.detalhes).toEqual(
        expect.arrayContaining([
          { campo: 'nome', mensagens: ['O nome nao pode ficar em branco'] },
          { campo: 'email', mensagens: ['Informe um e-mail valido'] },
          { campo: 'senha', mensagens: ['A senha deve ter no minimo 8 caracteres'] },
          { campo: 'admin', mensagens: ['O campo admin nao e permitido'] },
        ]),
      );
    });

    it('faz login e recusa senha errada sem dizer se o e-mail existe', async () => {
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'ana@teste.com', senha: 'senhaSegura123' })
        .expect(200);

      const senhaErrada = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'ana@teste.com', senha: 'errada123' })
        .expect(401);
      const emailDesconhecido = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'ninguem@teste.com', senha: 'errada123' })
        .expect(401);

      expect(senhaErrada.body.codigo).toBe('CREDENCIAIS_INVALIDAS');
      expect(emailDesconhecido.body.mensagem).toBe(senhaErrada.body.mensagem);
    });
  });

  describe('sessoes', () => {
    it('troca o refresh token por um par novo e invalida o antigo', async () => {
      const conta = await registrar(t.http, 'Bia', 'bia@teste.com');

      const { body: novo } = await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: conta.refreshToken })
        .expect(200);

      expect(novo.refreshToken).not.toBe(conta.refreshToken);
      await t.http().get('/api/v1/usuarios/eu').set(bearer(novo.accessToken)).expect(200);

      // Reusar o token trocado e sinal de roubo: derruba todas as sessoes.
      const reuso = await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: conta.refreshToken })
        .expect(401);
      expect(reuso.body.codigo).toBe('REFRESH_TOKEN_INVALIDO');

      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: novo.refreshToken })
        .expect(401);
      const { body } = await t
        .http()
        .get('/api/v1/usuarios/eu')
        .set(bearer(novo.accessToken))
        .expect(401);
      expect(body.codigo).toBe('SESSAO_ENCERRADA');
    });

    it('logout revoga so a sessao informada, sem exigir o access token', async () => {
      const conta = await registrar(t.http, 'Caio', 'caio@teste.com');
      const { body: outra } = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'caio@teste.com', senha: 'senhaSegura123' })
        .expect(200);

      await t
        .http()
        .post('/api/v1/auth/logout')
        .send({ refreshToken: conta.refreshToken })
        .expect(204);

      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: conta.refreshToken })
        .expect(401);
      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: outra.refreshToken })
        .expect(200);
    });

    it('DELETE /usuarios/eu/sessoes derruba todos os dispositivos na hora', async () => {
      const conta = await registrar(t.http, 'Davi', 'davi@teste.com');

      await t.http().delete('/api/v1/usuarios/eu/sessoes').set(bearer(conta.token)).expect(204);

      await t.http().get('/api/v1/usuarios/eu').set(bearer(conta.token)).expect(401);
      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: conta.refreshToken })
        .expect(401);
    });
  });

  describe('recuperacao de senha', () => {
    it('envia o codigo, libera a troca e encerra as sessoes antigas', async () => {
      const conta = await registrar(t.http, 'Eva', 'eva@teste.com');

      await t
        .http()
        .post('/api/v1/auth/recuperar-senha')
        .send({ email: 'eva@teste.com' })
        .expect(202);
      const codigo = await t.emails.esperarCodigo('eva@teste.com');

      const errado = await t
        .http()
        .post('/api/v1/auth/verificar-codigo')
        .send({ email: 'eva@teste.com', codigo: codigo === '000000' ? '111111' : '000000' })
        .expect(400);
      expect(errado.body.codigo).toBe('CODIGO_RECUPERACAO_INVALIDO');

      const { body: verificacao } = await t
        .http()
        .post('/api/v1/auth/verificar-codigo')
        .send({ email: 'eva@teste.com', codigo })
        .expect(200);

      const divergente = await t
        .http()
        .post('/api/v1/auth/redefinir-senha')
        .send({
          tokenTroca: verificacao.tokenTroca,
          novaSenha: 'novaSenha123',
          confirmarNovaSenha: 'outraSenha123',
        })
        .expect(400);
      expect(divergente.body.codigo).toBe('SENHAS_DIVERGENTES');

      await t
        .http()
        .post('/api/v1/auth/redefinir-senha')
        .send({
          tokenTroca: verificacao.tokenTroca,
          novaSenha: 'novaSenha123',
          confirmarNovaSenha: 'novaSenha123',
        })
        .expect(200);

      await t.http().get('/api/v1/usuarios/eu').set(bearer(conta.token)).expect(401);
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'eva@teste.com', senha: 'novaSenha123' })
        .expect(200);

      // O token de troca vale uma vez so.
      const reuso = await t
        .http()
        .post('/api/v1/auth/redefinir-senha')
        .send({
          tokenTroca: verificacao.tokenTroca,
          novaSenha: 'terceira123',
          confirmarNovaSenha: 'terceira123',
        })
        .expect(400);
      expect(reuso.body.codigo).toBe('TOKEN_TROCA_INVALIDO');
    });

    it('responde igual para e-mail desconhecido e nao envia nada', async () => {
      const antes = t.emails.mensagens.length;

      const { body } = await t
        .http()
        .post('/api/v1/auth/recuperar-senha')
        .send({ email: 'fantasma@teste.com' })
        .expect(202);

      await new Promise((resolver) => setTimeout(resolver, 100));
      expect(body.mensagem).toContain('Se houver uma conta');
      expect(t.emails.mensagens).toHaveLength(antes);
    });

    it('queima o codigo depois de 5 tentativas erradas', async () => {
      await registrar(t.http, 'Fabio', 'fabio@teste.com');
      await t
        .http()
        .post('/api/v1/auth/recuperar-senha')
        .send({ email: 'fabio@teste.com' })
        .expect(202);
      const codigo = await t.emails.esperarCodigo('fabio@teste.com');
      const errado = codigo === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        await t
          .http()
          .post('/api/v1/auth/verificar-codigo')
          .send({ email: 'fabio@teste.com', codigo: errado })
          .expect(400);
      }

      await t
        .http()
        .post('/api/v1/auth/verificar-codigo')
        .send({ email: 'fabio@teste.com', codigo })
        .expect(400);
    });
  });

  describe('conta', () => {
    it('le e atualiza o perfil', async () => {
      const conta = await registrar(t.http, 'Gil', 'gil@teste.com');

      const { body } = await t
        .http()
        .patch('/api/v1/usuarios/eu')
        .set(bearer(conta.token))
        .send({ nome: '  Gilberto  ' })
        .expect(200);

      expect(body).toMatchObject({ id: conta.id, nome: 'Gilberto', email: 'gil@teste.com' });
      expect(body.criadoEm).toEqual(expect.any(String));

      const nulo = await t
        .http()
        .patch('/api/v1/usuarios/eu')
        .set(bearer(conta.token))
        .send({ nome: null })
        .expect(400);
      expect(nulo.body.codigo).toBe('VALIDACAO');
    });

    it('troca a senha, derruba as outras sessoes e mantem este dispositivo', async () => {
      const conta = await registrar(t.http, 'Hugo', 'hugo@teste.com');

      const incorreta = await t
        .http()
        .put('/api/v1/usuarios/eu/senha')
        .set(bearer(conta.token))
        .send({
          senhaAtual: 'errada123',
          novaSenha: 'novaSenha123',
          confirmarNovaSenha: 'novaSenha123',
        })
        .expect(400);
      expect(incorreta.body.codigo).toBe('SENHA_ATUAL_INCORRETA');

      const { body } = await t
        .http()
        .put('/api/v1/usuarios/eu/senha')
        .set(bearer(conta.token))
        .send({
          senhaAtual: 'senhaSegura123',
          novaSenha: 'novaSenha123',
          confirmarNovaSenha: 'novaSenha123',
        })
        .expect(200);

      await t.http().get('/api/v1/usuarios/eu').set(bearer(conta.token)).expect(401);
      await t.http().get('/api/v1/usuarios/eu').set(bearer(body.accessToken)).expect(200);
      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: conta.refreshToken })
        .expect(401);
    });

    it('exclui a conta so com a senha certa, levando as viagens criadas', async () => {
      const conta = await registrar(t.http, 'Iris', 'iris@teste.com');
      const { body: viagem } = await t
        .http()
        .post('/api/v1/viagens')
        .set(bearer(conta.token))
        .send({ nome: 'Some junto' })
        .expect(201);

      await t
        .http()
        .post('/api/v1/usuarios/eu/exclusao')
        .set(bearer(conta.token))
        .send({ senha: 'errada123' })
        .expect(400);

      await t
        .http()
        .post('/api/v1/usuarios/eu/exclusao')
        .set(bearer(conta.token))
        .send({ senha: 'senhaSegura123' })
        .expect(204);

      const { body } = await t
        .http()
        .get('/api/v1/usuarios/eu')
        .set(bearer(conta.token))
        .expect(401);
      expect(body.codigo).toBe('USUARIO_NAO_ENCONTRADO');

      const outra = await registrar(t.http, 'Jo', 'jo@teste.com');
      await t.http().get(`/api/v1/viagens/${viagem.id}`).set(bearer(outra.token)).expect(404);
    });
  });
});
