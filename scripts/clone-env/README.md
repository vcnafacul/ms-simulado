# clone-env — Clona um ambiente Mongo remoto para um Mongo local

Gera uma **cópia exata** do database Mongo de um ambiente remoto (homol/prod) dentro de um
**Mongo local isolado em Docker**, para você testar e alterar schemas à vontade sem tocar no
remoto.

- **Origem read-only**: só `mongodump`. Nunca escreve no remoto.
- **Destino isolado**: container Docker dedicado na porta `27018`, recriado do zero a cada run.
- **Zero instalação no host**: tudo roda em containers `mongo:7`.

## Pré-requisitos

- Docker rodando.
- `jq` no host (já usado pelos scripts de migration).
- A imagem `mongo:7` (baixada no primeiro uso).

## Configuração

No `.env` do `ms-simulado`:

```bash
SOURCE_MONGODB=mongodb+srv://user:pass@cluster.mongodb.net/simulado
```

A URI **precisa** conter o nome do database no path (`/simulado`).

## Uso

```bash
npm run clone:env                   # lê .env, confirma, clona
npm run clone:env -- --yes          # pula a confirmação (automação)
npm run clone:env -- --keep-dump    # mantém o archive.gz do dump
npm run clone:env -- --no-validate  # pula a contagem de validação
```

Ao final, o script imprime a URI local. Aponte o ms-simulado para o clone editando o `.env`:

```bash
MONGODB=mongodb://localhost:27018/simulado
```

## Variáveis

| Var | Default | Papel |
|-----|---------|-------|
| `SOURCE_MONGODB` | *(obrigatória)* | URI do remoto, read-only |
| `CLONE_CONTAINER_NAME` | `mssimulado-clone` | nome do container local |
| `CLONE_PORT` | `27018` | porta publicada no host |
| `CLONE_NETWORK` | `mssimulado-clone-net` | rede Docker dedicada |
| `CLONE_MONGO_IMAGE` | `mongo:7` | imagem (server + tools) |
| `SLEEP_BETWEEN_OPS` | `1` | throttle entre chamadas ao remoto (segundos) |

## Troubleshooting

- **"SOURCE_MONGODB não especifica o database"**: adicione `/nome-do-db` ao final da URI
  (antes do `?query`).
- **"aponta para host local"**: a origem deve ser remota; o script recusa `localhost`/`127.0.0.1`.
- **Porta 27018 ocupada**: defina `CLONE_PORT` para outra porta no `.env`.
- **Ver os dados do clone sem mongosh no host**:
  ```bash
  docker run --rm --network mssimulado-clone-net mongo:7 \
    mongosh 'mongodb://mssimulado-clone:27017/simulado' --quiet \
    --eval 'db.getCollectionNames()'
  ```
- **Remover tudo**:
  ```bash
  docker rm -f mssimulado-clone
  docker volume rm mssimulado-clone-data
  docker network rm mssimulado-clone-net
  ```
