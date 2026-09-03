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
