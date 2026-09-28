# Migração 0005 — `teveSucessora`

tickets/023, card 18. Roda **antes** do deploy do ms que traz o card 19 (o "Buscar atualizações" passa a
ler este campo). Rodar antes do card 18 também não faz mal.

```bash
MONGODB='mongodb://...' bash migrar.sh
```

## O que faz
Marca `teveSucessora: true` em toda questão que é `origem` de uma versão (`tipoOrigem: "versao"`). Não
mexe em `congelada`.

## Por quê
Até o card 18, "tem versão mais nova" era o mesmo que `congelada`. Agora a original pode seguir viva e
editável (em provas com versões fixas) e só congela quando ninguém mais a usa. Sem o campo, as questões
versionadas antes da mudança:
- não aparecem no "Buscar atualizações" (card 19);
- aceitariam uma 2ª versão, criando um galho na linhagem.

## Idempotência
O filtro pula quem já tem `teveSucessora: true`. Rodar de novo não muda nada.

## Rollback
`db.questaos.updateMany({}, { $unset: { teveSucessora: "" } })` — só junto com a volta do código.
