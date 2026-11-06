# Programação da reunião do meio de semana

## Executar

1. Copie `.env.example` para `.env` e defina um usuário e uma senha administrativa segura.
2. Instale e execute:

```bash
npm install
npm run prod
```

O servidor usa `data/app.sqlite` por padrão. Na primeira inicialização, o estado global antigo é migrado para a congregação **Meaípe** e o registro legado é preservado.

Em produção, defina `NODE_ENV=production` e publique a aplicação por HTTPS para que o cookie seguro de sessão funcione corretamente.

## Verificações

```bash
npm test
npm run build
```

## Salvamento protegido

Cada congregação possui uma versão independente. A atualização adiciona essa coluna
automaticamente ao SQLite, preservando o JSON e a data dos registros existentes.
Publique o servidor e o resultado de `npm run build` juntos e reinicie o processo
da aplicação no PM2. Abas abertas antes da atualização precisam recarregar a página.

- O editor mostra alterações pendentes, salvamento em andamento, sucesso e falha.
- Outra sessão que já tenha salvo provoca um conflito: a aba mantém as alterações
  locais em memória e interrompe os salvamentos até o usuário confirmar o recarregamento.
- Falhas de conexão interrompem a fila; o botão **Tentar salvar novamente** faz uma
  tentativa explícita com a mesma versão, sem forçar a sobrescrita.
- O salvamento comum não pode remover pessoas ou semanas existentes. Pessoas só
  podem ser excluídas individualmente, após salvar as alterações e confirmar o nome.
  As designações já registradas permanecem nas programações após a exclusão.
- Dados inválidos ou falhas de carregamento bloqueiam a edição. Um estado novo só
  é inicializado quando a API responde explicitamente que ainda não há dados.

### Contrato da API

`GET /api/congregations/:id/state` retorna `state`, `version`, `updatedAt` e
`congregation`, sem cache. Um estado ainda não inicializado retorna `state: null`
e `version: 0`; registros existentes começam na versão `1`.

`PUT /api/congregations/:id/state` recebe o estado completo no corpo e exige o
cabeçalho `If-Match: "<version>"`. A resposta confirma a nova `version` e `updatedAt`.

`DELETE /api/congregations/:id/participants/:participantId` exige o mesmo cabeçalho
e as mesmas permissões de acesso. A resposta inclui o estado completo atualizado.

As verificações de versão e as gravações ocorrem na mesma transação. Erros não
alteram os registros:

- `428`: versão ausente, incluindo clientes antigos; atualizar a página.
- `409`: versão desatualizada; recarregar com confirmação de descarte local.
- `400`: versão malformada ou estado inválido/incompleto.
- `422`: tentativa de remover pessoas ou semanas pelo salvamento comum.

Esta melhoria não inclui histórico, backups automáticos ou recuperação. Alterações
nunca confirmadas pelo servidor permanecem somente na aba enquanto ela estiver aberta.
