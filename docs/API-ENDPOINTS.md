# API Endpoints - Microsserviço de Simulados

Documentação dos endpoints para integração com o front-end.

**Base URL:** `http://localhost:3000` (desenvolvimento)

---

## 📚 Matéria

### 1. Listar Todas as Matérias
```http
GET /v1/materia
```

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| page | number | Não | Número da página (default: 1) |
| limit | number | Não | Items por página (default: 10) |

**Resposta de Sucesso (200):**
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "nome": "Matemática",
      "enemArea": "Matemática e suas Tecnologias",
      "frentes": ["507f1f77bcf86cd799439012"],
      "createdAt": "2025-11-24T10:00:00.000Z",
      "updatedAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalItems": 1
}
```

---

### 2. Buscar Matéria por ID
```http
GET /v1/materia/:id
```

**Parâmetros:**
- `id` - ID da matéria

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "nome": "Matemática",
  "enemArea": "Matemática e suas Tecnologias",
  "frentes": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "nome": "Álgebra",
      "order": 0
    }
  ],
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

---

### 3. Criar Matéria
```http
POST /v1/materia
Content-Type: application/json
```

**Body:**
```json
{
  "nome": "Matemática"
}
```

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "nome": "Matemática",
  "enemArea": "",
  "frentes": [],
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

**Resposta de Erro (400):**
```json
{
  "statusCode": 400,
  "message": ["O nome sugerido já existe"],
  "error": "Bad Request"
}
```

---

### 4. Deletar Matéria
```http
DELETE /v1/materia/:id
```

**Parâmetros:**
- `id` - ID da matéria

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

## 🎯 Frente

### 1. Listar Todas as Frentes
```http
GET /v1/frente
```

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| page | number | Não | Número da página (default: 1) |
| limit | number | Não | Items por página (default: 10) |

**Resposta de Sucesso (200):**
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "nome": "Álgebra",
      "materia": {
        "_id": "507f1f77bcf86cd799439011",
        "nome": "Matemática"
      },
      "subjects": ["507f1f77bcf86cd799439013"],
      "order": 0,
      "createdAt": "2025-11-24T10:00:00.000Z",
      "updatedAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalItems": 1
}
```

---

### 2. Buscar Frente por ID
```http
GET /v1/frente/:id
```

**Parâmetros:**
- `id` - ID da frente

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "nome": "Álgebra",
  "materia": {
    "_id": "507f1f77bcf86cd799439011",
    "nome": "Matemática"
  },
  "subjects": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "name": "Equações",
      "order": 0
    }
  ],
  "order": 0,
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

---

### 3. Criar Frente
```http
POST /v1/frente
Content-Type: application/json
```

**Body:**
```json
{
  "nome": "Álgebra",
  "materia": "507f1f77bcf86cd799439011"
}
```

**Campos:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| nome | string | Sim | Nome da frente |
| materia | string | Sim | ID da matéria pai |

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "nome": "Álgebra",
  "materia": "507f1f77bcf86cd799439011",
  "subjects": [],
  "order": 0,
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

**Resposta de Erro (400):**
```json
{
  "statusCode": 400,
  "message": ["O nome sugerido já existe"],
  "error": "Bad Request"
}
```

---

### 4. Deletar Frente
```http
DELETE /v1/frente/:id
```

**Parâmetros:**
- `id` - ID da frente

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 5. Trocar Ordem de 2 Frentes
```http
PATCH /v1/frente/swap-order
Content-Type: application/json
```

**Body:**
```json
{
  "id1": "507f1f77bcf86cd799439012",
  "id2": "507f1f77bcf86cd799439014"
}
```

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 6. Mover Frente para Posição Específica
```http
PATCH /v1/frente/:id/move-to-position
Content-Type: application/json
```

**Parâmetros:**
- `id` - ID da frente

**Body:**
```json
{
  "position": 2,
  "materiaId": "507f1f77bcf86cd799439011"
}
```

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 7. Mover Frente Uma Posição Acima
```http
PATCH /v1/frente/:id/move-up?materiaId=507f1f77bcf86cd799439011
```

**Parâmetros:**
- `id` - ID da frente
- `materiaId` - ID da matéria (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 8. Mover Frente Uma Posição Abaixo
```http
PATCH /v1/frente/:id/move-down?materiaId=507f1f77bcf86cd799439011
```

**Parâmetros:**
- `id` - ID da frente
- `materiaId` - ID da matéria (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 9. Mover Frente para o Topo
```http
PATCH /v1/frente/:id/move-to-top?materiaId=507f1f77bcf86cd799439011
```

**Parâmetros:**
- `id` - ID da frente
- `materiaId` - ID da matéria (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 10. Mover Frente para o Final
```http
PATCH /v1/frente/:id/move-to-bottom?materiaId=507f1f77bcf86cd799439011
```

**Parâmetros:**
- `id` - ID da frente
- `materiaId` - ID da matéria (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

## 📖 Subject

### 1. Listar Todos os Subjects
```http
GET /v1/subject
```

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| page | number | Não | Número da página (default: 1) |
| limit | number | Não | Items por página (default: 10) |

**Resposta de Sucesso (200):**
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "name": "Equações do 1º Grau",
      "description": "Resolução de equações lineares",
      "frente": {
        "_id": "507f1f77bcf86cd799439012",
        "nome": "Álgebra"
      },
      "contents": ["507f1f77bcf86cd799439014"],
      "order": 0,
      "createdAt": "2025-11-24T10:00:00.000Z",
      "updatedAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalItems": 1
}
```

---

### 2. Buscar Subject por ID
```http
GET /v1/subject/:id
```

**Parâmetros:**
- `id` - ID do subject

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "name": "Equações do 1º Grau",
  "description": "Resolução de equações lineares",
  "frente": {
    "_id": "507f1f77bcf86cd799439012",
    "nome": "Álgebra"
  },
  "contents": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "title": "Introdução",
      "order": 0
    }
  ],
  "order": 0,
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

---

### 3. Criar Subject
```http
POST /v1/subject
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Equações do 1º Grau",
  "description": "Resolução de equações lineares",
  "frente": "507f1f77bcf86cd799439012"
}
```

**Campos:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| name | string | Sim | Nome do subject |
| description | string | Sim | Descrição do subject |
| frente | string | Sim | ID da frente pai |

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "name": "Equações do 1º Grau",
  "description": "Resolução de equações lineares",
  "frente": "507f1f77bcf86cd799439012",
  "contents": [],
  "order": 0,
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

**Resposta de Erro (400):**
```json
{
  "statusCode": 400,
  "message": ["Já existe um subject com esse nome nesta frente"],
  "error": "Bad Request"
}
```

---

### 4. Deletar Subject
```http
DELETE /v1/subject/:id
```

**Parâmetros:**
- `id` - ID do subject

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 5. Trocar Ordem de 2 Subjects
```http
PATCH /v1/subject/swap-order
Content-Type: application/json
```

**Body:**
```json
{
  "id1": "507f1f77bcf86cd799439013",
  "id2": "507f1f77bcf86cd799439015"
}
```

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 6. Mover Subject para Posição Específica
```http
PATCH /v1/subject/:id/move-to-position
Content-Type: application/json
```

**Parâmetros:**
- `id` - ID do subject

**Body:**
```json
{
  "position": 1,
  "frenteId": "507f1f77bcf86cd799439012"
}
```

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 7. Mover Subject Uma Posição Acima
```http
PATCH /v1/subject/:id/move-up?frenteId=507f1f77bcf86cd799439012
```

**Parâmetros:**
- `id` - ID do subject
- `frenteId` - ID da frente (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 8. Mover Subject Uma Posição Abaixo
```http
PATCH /v1/subject/:id/move-down?frenteId=507f1f77bcf86cd799439012
```

**Parâmetros:**
- `id` - ID do subject
- `frenteId` - ID da frente (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 9. Mover Subject para o Topo
```http
PATCH /v1/subject/:id/move-to-top?frenteId=507f1f77bcf86cd799439012
```

**Parâmetros:**
- `id` - ID do subject
- `frenteId` - ID da frente (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 10. Mover Subject para o Final
```http
PATCH /v1/subject/:id/move-to-bottom?frenteId=507f1f77bcf86cd799439012
```

**Parâmetros:**
- `id` - ID do subject
- `frenteId` - ID da frente (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

## 📝 Content

### 1. Listar Todos os Contents
```http
GET /v1/content
```

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| page | number | Não | Número da página (default: 1) |
| limit | number | Não | Items por página (default: 10) |

**Resposta de Sucesso (200):**
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "title": "Introdução às Equações",
      "description": "Conceitos básicos de equações lineares",
      "subject": {
        "_id": "507f1f77bcf86cd799439013",
        "name": "Equações do 1º Grau"
      },
      "mainFile": {
        "_id": "507f1f77bcf86cd799439015",
        "fileKey": "files/intro-equacoes.pdf"
      },
      "files": ["507f1f77bcf86cd799439015"],
      "status": 3,
      "order": 0,
      "createdAt": "2025-11-24T10:00:00.000Z",
      "updatedAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalItems": 1
}
```

---

### 2. Buscar Content por ID
```http
GET /v1/content/:id
```

**Parâmetros:**
- `id` - ID do content

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439014",
  "title": "Introdução às Equações",
  "description": "Conceitos básicos de equações lineares",
  "subject": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "Equações do 1º Grau"
  },
  "mainFile": {
    "_id": "507f1f77bcf86cd799439015",
    "fileKey": "files/intro-equacoes.pdf",
    "content": "507f1f77bcf86cd799439014"
  },
  "files": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "fileKey": "files/intro-equacoes.pdf"
    }
  ],
  "status": 3,
  "order": 0,
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

---

### 3. Criar Content
```http
POST /v1/content
Content-Type: application/json
```

**Body:**
```json
{
  "title": "Introdução às Equações",
  "description": "Conceitos básicos de equações lineares",
  "subject": "507f1f77bcf86cd799439013"
}
```

**Campos:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| title | string | Sim | Título do conteúdo |
| description | string | Sim | Descrição do conteúdo |
| subject | string | Sim | ID do subject pai |

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439014",
  "title": "Introdução às Equações",
  "description": "Conceitos básicos de equações lineares",
  "subject": "507f1f77bcf86cd799439013",
  "mainFile": null,
  "files": [],
  "status": 3,
  "order": 0,
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

**Nota:** Status 3 = `Pending_Upload` (aguardando upload de arquivo)

---

### 4. Deletar Content
```http
DELETE /v1/content/:id
```

**Parâmetros:**
- `id` - ID do content

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 5. Fazer Upload de Arquivo
```http
POST /v1/content/file
Content-Type: application/json
```

**Body:**
```json
{
  "fileKey": "files/intro-equacoes-v2.pdf",
  "content": "507f1f77bcf86cd799439014",
  "user": {
    "name": "João Silva",
    "email": "joao@email.com",
    "id": "user-123"
  }
}
```

**Campos:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| fileKey | string | Sim | Chave do arquivo (após upload S3/storage) |
| content | string | Sim | ID do content |
| user | object | Sim | Dados do usuário que fez upload |
| user.name | string | Sim | Nome do usuário |
| user.email | string | Sim | Email do usuário |
| user.id | string | Sim | ID do usuário |

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "fileKey": "files/intro-equacoes-v2.pdf",
  "content": "507f1f77bcf86cd799439014",
  "user": {
    "name": "João Silva",
    "email": "joao@email.com",
    "id": "user-123"
  },
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

**Nota:** 
- Este arquivo automaticamente se torna o `mainFile` do content
- É adicionado ao array `files[]` do content
- Histórico de uploads é mantido

---

### 6. Listar Todos os Arquivos
```http
GET /v1/content/file
```

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| page | number | Não | Número da página (default: 1) |
| limit | number | Não | Items por página (default: 10) |

**Resposta de Sucesso (200):**
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "fileKey": "files/intro-equacoes.pdf",
      "content": "507f1f77bcf86cd799439014",
      "user": {
        "name": "João Silva",
        "email": "joao@email.com",
        "id": "user-123"
      },
      "createdAt": "2025-11-24T10:00:00.000Z",
      "updatedAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalItems": 1
}
```

---

### 7. Buscar Arquivo por ID
```http
GET /v1/content/file/:id
```

**Parâmetros:**
- `id` - ID do arquivo

**Resposta de Sucesso (200):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "fileKey": "files/intro-equacoes.pdf",
  "content": "507f1f77bcf86cd799439014",
  "user": {
    "name": "João Silva",
    "email": "joao@email.com",
    "id": "user-123"
  },
  "createdAt": "2025-11-24T10:00:00.000Z",
  "updatedAt": "2025-11-24T10:00:00.000Z"
}
```

---

### 8. Deletar Arquivo
```http
DELETE /v1/content/file/:id
```

**Parâmetros:**
- `id` - ID do arquivo

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 9. Trocar Ordem de 2 Contents
```http
PATCH /v1/content/swap-order
Content-Type: application/json
```

**Body:**
```json
{
  "id1": "507f1f77bcf86cd799439014",
  "id2": "507f1f77bcf86cd799439016"
}
```

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 10. Mover Content para Posição Específica
```http
PATCH /v1/content/:id/move-to-position
Content-Type: application/json
```

**Parâmetros:**
- `id` - ID do content

**Body:**
```json
{
  "position": 0,
  "subjectId": "507f1f77bcf86cd799439013"
}
```

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 11. Mover Content Uma Posição Acima
```http
PATCH /v1/content/:id/move-up?subjectId=507f1f77bcf86cd799439013
```

**Parâmetros:**
- `id` - ID do content
- `subjectId` - ID do subject (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 12. Mover Content Uma Posição Abaixo
```http
PATCH /v1/content/:id/move-down?subjectId=507f1f77bcf86cd799439013
```

**Parâmetros:**
- `id` - ID do content
- `subjectId` - ID do subject (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 13. Mover Content para o Topo
```http
PATCH /v1/content/:id/move-to-top?subjectId=507f1f77bcf86cd799439013
```

**Parâmetros:**
- `id` - ID do content
- `subjectId` - ID do subject (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

### 14. Mover Content para o Final
```http
PATCH /v1/content/:id/move-to-bottom?subjectId=507f1f77bcf86cd799439013
```

**Parâmetros:**
- `id` - ID do content
- `subjectId` - ID do subject (query parameter)

**Resposta de Sucesso (200):**
```
(sem conteúdo)
```

---

## 📊 Status do Content

| Valor | Nome | Descrição |
|-------|------|-----------|
| 0 | Pending | Pendente |
| 1 | Approved | Aprovado |
| 2 | Rejected | Rejeitado |
| 3 | Pending_Upload | Aguardando Upload (padrão na criação) |

---

## 🔗 Fluxo de Criação Completo

### Passo 1: Criar Matéria
```bash
POST /v1/materia
{ "nome": "Matemática" }
```
**Retorna:** `materia._id`

### Passo 2: Criar Frente
```bash
POST /v1/frente
{
  "nome": "Álgebra",
  "materia": "<materia._id>"
}
```
**Retorna:** `frente._id`

### Passo 3: Criar Subject
```bash
POST /v1/subject
{
  "name": "Equações do 1º Grau",
  "description": "Resolução de equações lineares",
  "frente": "<frente._id>"
}
```
**Retorna:** `subject._id`

### Passo 4: Criar Content
```bash
POST /v1/content
{
  "title": "Introdução",
  "description": "Conceitos básicos",
  "subject": "<subject._id>"
}
```
**Retorna:** `content._id` (status: Pending_Upload)

### Passo 5: Fazer Upload do Arquivo
```bash
# Primeiro: Upload do arquivo para S3/Storage
# Depois: Registrar no sistema
POST /v1/content/file
{
  "fileKey": "files/intro-v1.pdf",
  "content": "<content._id>",
  "user": {
    "name": "João",
    "email": "joao@email.com",
    "id": "user-123"
  }
}
```
**Resultado:** 
- Arquivo registrado
- `content.mainFile` atualizado
- Adicionado ao `content.files[]`

---

## 🎯 Dicas para Integração

### 1. **Ordenação**
Todos os endpoints de listagem retornam dados ordenados pelo campo `order`. Use os endpoints de reordenação para implementar drag & drop.

### 2. **Relacionamentos**
- Frentes pertencem a Matérias
- Subjects pertencem a Frentes
- Contents pertencem a Subjects
- FileContents pertencem a Contents

### 3. **Upload de Arquivos**
O fluxo de upload é em 2 etapas:
1. Upload do arquivo físico para storage (S3/CDN)
2. Registro do `fileKey` no sistema via `/v1/content/file`

### 4. **Validações**
- Nomes de frentes são únicos (globalmente)
- Nomes de subjects são únicos por frente
- Matérias com nome único

### 5. **Paginação**
Todos os endpoints de listagem suportam paginação:
```
?page=1&limit=10
```

---

## 🌐 Swagger

Documentação interativa disponível em:
```
http://localhost:3000/api
```

Teste todos os endpoints diretamente pelo navegador!

---

**Documentação gerada em:** 24 de Novembro de 2025  
**Versão da API:** v1  
**Base URL:** `/v1`

