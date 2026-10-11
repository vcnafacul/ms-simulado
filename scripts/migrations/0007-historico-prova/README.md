# Migração 0007 — histórico com prova (tickets/038, card 05)

> ✅ **Roda sozinha no deploy** do ms-simulado (homol e prod), antes do app subir — ver `src/migracoes`. O que já
> rodou num ambiente fica na coleção `_migracoes` do banco. O comando abaixo serve para rodar à mão (local).

**Por quê:** o cartão passa a ser ligado à **prova** (R8a/R9). Os históricos de cartão novos já nascem com
`prova`; esta migração preenche os antigos e cria o índice "um cartão da prova por estudante" (R10).

```bash
MONGODB='mongodb://...' yarn migracao:0007            # 1º: só CONTA
MONGODB='mongodb://...' yarn migracao:0007 --aplicar  # 2º: preenche e cria o índice
```

Rodar **antes do deploy do ms** da série 038, em homol e em prod.

- Preenche `prova` só em histórico **de cartão** (`cartaoCode`), pela prova viva que contém o simulado (a mais
  antiga, se houver mais de uma). Simulado que não está em prova nenhuma fica sem — é contado.
- **Troca o índice `cartao_por_estudante` pelo `cartao_por_estudante_v2`**, que tem `prova` na chave. Sem isso,
  dois cartões da prova do mesmo aluno em provas diferentes colidiriam enquanto o simulado está vazio (os dois
  são `#001`, porque o contador é por prova). A chave nova contém a antiga, então não há duplicado; a v2 é criada
  antes de a v1 sair.
- O índice `cartao_da_prova_por_estudante` é parcial em `cartaoDaProva: true`, um campo que **nenhum** histórico
  antigo tem: não há duplicado possível. Vai pela migração porque o `autoIndex` falha calado (ver a 0006).
- Idempotente.

## Rollback
```js
db.historicos.dropIndex("cartao_da_prova_por_estudante")
db.historicos.createIndex({ usuario: 1, simulado: 1, cartaoCode: 1 },
  { unique: true, name: "cartao_por_estudante", partialFilterExpression: { cartaoCode: { $type: "string" } } })
db.historicos.dropIndex("cartao_por_estudante_v2")
// `prova` nos históricos antigos é só informação a mais; não precisa desfazer.
```
