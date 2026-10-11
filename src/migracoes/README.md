# Migrações e seeds automáticos (deploy)

No deploy (homol e prod), o container roda `node migracoes/rodar.js` **antes** do app (ver o `CMD` do
`ms.dockerfile`):

- **Migrações** (`registro.ts` → `MIGRACOES`): rodam **uma vez por ambiente**, em ordem. Cada uma aplicada vira um
  documento em **`_migracoes`** (`_id` = id da migração, `tipo: 'migracao'`, `aplicadaEm`, `duracaoMs`,
  `resultado`). Se uma falha, o app **não sobe** e o deploy aparece como falho; ela roda de novo no próximo.
- **Seeds** (`SEEDS`): rodam em **todo** deploy e são idempotentes. O último resultado fica em `_migracoes`
  (`tipo: 'seed'`, `ultimaExecucaoEm`, `ok`). Seed que falha é registrado e **não** impede o app de subir.
- **Trava** (`_migracoes_trava`): duas instâncias subindo juntas não rodam a mesma migração em paralelo.

Começa na **0007**: as 0001–0006 são scripts `mongosh` rodados à mão, uma vez, com decisões caso a caso.

## Acrescentar uma migração
1. A função em `migracoes/NNNN-nome.ts` — **idempotente** (rodar duas vezes não pode estragar nada).
2. A entrada **no fim** de `MIGRACOES`, com um id que **nunca** muda depois de ir para algum ambiente.
3. Teste contra Mongo real (ver `executor.spec.ts`).

## Rodar à mão (local)
```bash
yarn migracoes          # usa o MONGODB do .env
```

## Ver o que já rodou num ambiente
```js
db._migracoes.find().sort({ aplicadaEm: 1 })
```
