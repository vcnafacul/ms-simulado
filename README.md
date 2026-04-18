# 🧠 Você na Facul — ms-simulado

Microsserviço responsável pelo **motor de simulados (provas)** da plataforma **Você na Facul**.

Cuida do banco de questões, montagem de provas (simulados, ENEM), aplicação, respostas, correção automática e relatórios de desempenho. **Não é exposto ao público**: só recebe chamadas do gateway `api-vcnafacul`.

---

## 🧩 Arquitetura

```
client-vcnafacul  →  api-vcnafacul  →  ms-simulado       ← você está aqui
  (React SPA)       (NestJS gateway)   (NestJS + MongoDB)
                         ↓
                    vcnafacul-form    (construtor de formulários)
                    (NestJS + MongoDB)
```

| Serviço | Stack | Banco | Porta |
|---------|-------|-------|-------|
| api-vcnafacul | NestJS 10 + TypeORM | MySQL 8+ | `3333` |
| **ms-simulado** (este) | NestJS 10 + Mongoose | MongoDB | `3000` |
| vcnafacul-form | NestJS 11 + Mongoose | MongoDB | `3001` |
| client-vcnafacul | React 19 + Vite 6 | — | `5173` |

---

## 🛠 Tecnologias

- **NestJS 10** (TypeScript)
- **MongoDB** + **Mongoose**
- **BaseService** genérico com cache embutido
- **Swagger** em `/api`
- **Class-Validator** / **Class-Transformer**
- **Jest** (unit + e2e)

---

## 📂 Domínio

Principais bounded contexts:

- **Questão** — enunciado, alternativas, gabarito, metadados (matéria, frente, ano, prova)
- **Simulado** — montagem de prova a partir do banco de questões
- **Resposta / Aplicação** — registro de respostas de estudantes e correção
- **Relatório** — estatísticas de acertos por matéria/frente

Termos em português: _simulado_ (prova), _frente_ (subárea), _matéria_ (disciplina), _questão_ (pergunta), _prova_ (exame origem).

---

## ⚙️ Pré-requisitos

- Node.js 20+
- Yarn
- MongoDB 6+

---

## 🚀 Setup

```bash
# Instalar dependências
yarn

# Copiar .env e preencher
cp .env.example .env
# NODE_ENV, MONGODB, PORT

# Subir em modo watch (porta 3000)
yarn dev
```

---

## 📑 Documentação da API

Swagger disponível em:

```
http://localhost:3000/api
```

---

## 🧪 Testes

```bash
# Unit
yarn test

# e2e
yarn test:e2e

# cobertura
yarn test:cov

# Um arquivo específico (flags extras ajudam com handles abertos)
npx jest --detectOpenHandles --forceExit path/to/file.spec.ts
```

---

## 🔀 CI/CD

- `ci-homol.yml` — deploy em homologação ao mergear PR em `develop`
- `ci-prod.yml` — deploy em produção ao publicar tag `v*`

---

## 📄 Licença

MIT.
