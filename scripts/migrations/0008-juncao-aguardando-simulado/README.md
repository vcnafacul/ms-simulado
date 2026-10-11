# Migração 0008 — junção com linha "aguardando simulado" (tickets/038, card 13)

**Por quê:** o cartão DA PROVA do ENEM Dia 1 do cursinho só sabe o simulado no callback (pelo idioma marcado). A
linha do relatório (`relatoriosimuladoestudantes`) nasce no envio sem simulado, com a `prova`, para o cartão já poder
ser reenviado, baixado ou excluído. O índice único `{simulado, cursinhoId, usuario}` de hoje (sem nome, não parcial)
faria duas linhas assim do mesmo aluno colidirem em `null`.

```bash
MONGODB='mongodb://...' yarn migracao:0008            # só mostra os índices
MONGODB='mongodb://...' yarn migracao:0008 --aplicar  # troca
```

Rodar **antes do deploy do ms** do card 13, em homol e em prod (depois da 0007).

- Cria `juncao_por_estudante` (mesma chave, **parcial** em `simulado` ObjectId) **antes** de apagar
  `simulado_1_cursinhoId_1_usuario_1`: a chave é a mesma, não há duplicado possível, e nunca fica sem a trava.
- Cria `prova_1_cursinhoId_1` (parcial em `aguardandoSimulado: true`) para o relatório da prova achar as linhas
  aguardando.
- Idempotente.

## Rollback
```js
db.relatoriosimuladoestudantes.createIndex({ simulado: 1, cursinhoId: 1, usuario: 1 }, { unique: true })
db.relatoriosimuladoestudantes.dropIndex("juncao_por_estudante")
db.relatoriosimuladoestudantes.dropIndex("prova_1_cursinhoId_1")
// ⚠️ só funciona sem linhas aguardando simulado de dois cartões do mesmo aluno.
```
