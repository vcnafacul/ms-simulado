# Migração 0004 — `receberNovasVersoes` nas provas existentes

tickets/023, card 05. Roda **antes** do deploy do ms, em cada ambiente (homol e prod).

```bash
MONGODB='mongodb://...' bash migrar.sh
```

## O que faz

As provas **sem** o campo recebem `receberNovasVersoes: true`, ou seja, continuam recebendo novas versões das questões, como hoje. Só as provas **criadas depois** do deploy nascem com `false` (travadas).

O script conta antes e depois e aborta se sobrar alguma prova sem o campo.

## Por que antes do deploy

⚠️ O schema declara `default: false`, e o Mongoose aplica o default **ao ler** um documento sem o campo:

- Com o código novo no ar e sem a migração, toda prova antiga seria **lida** como travada. No próximo `save` (aprovar ou recusar questão, trocar arquivo), ela seria **gravada** assim, em silêncio.
- O card 06 filtra no banco (`receberNovasVersoes: true`), e o banco não vê o default: uma prova sem o campo não receberia a nova versão.

## Idempotência

O filtro é `{ receberNovasVersoes: { $exists: false } }`, então rodar de novo não muda nada, nem uma prova que o dono já tenha travado (`false`).

## Rollback

Só se voltar o código também. Com o código antigo no ar, o campo é inofensivo, porque ninguém o lê:

```js
db.provas.updateMany({}, { $unset: { receberNovasVersoes: "" } })
```
