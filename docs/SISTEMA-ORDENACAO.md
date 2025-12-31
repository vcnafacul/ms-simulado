# Sistema de Ordenação - Frente, Subject e Content

## 📋 Visão Geral

Este documento descreve a implementação do sistema de ordenação para as entidades **Frente**, **Subject** e **Content** no microsserviço de simulados.

O sistema permite reordenar itens de forma flexível e eficiente usando um campo `order` numérico, proporcionando controle total sobre a sequência de exibição dos conteúdos educacionais.

---

## 🏗️ Estrutura Hierárquica

```
Área ENEM
  └── Matérias
       └── Frentes (ordenável)
            └── Subjects (ordenável)
                 └── Contents (ordenável)
                      └── FileContent (mainFile + histórico files[])
```

---

## 📊 Schemas

### Campo `order` adicionado em:

#### **Frente**
```typescript
@Prop({ required: false, default: 0 })
@ApiProperty()
public order: number;
```

#### **Subject**
```typescript
@Prop({ required: false, default: 0 })
public order: number;
```

#### **Content**
```typescript
@Prop({ required: false, default: 0 })
public order: number;
```

---

## 🔄 Funcionalidades Implementadas

### 1. **Ordenação Automática na Criação**
- Ao criar um novo item, o sistema busca o maior `order` existente e adiciona +1
- Novos itens são sempre inseridos no final da lista
- Não há conflitos de ordem

### 2. **Ordenação na Listagem**
- Todas as consultas retornam dados ordenados por `order` (ascendente)
- Implementado nos repositories com `.sort({ order: 1 })`

### 3. **Operações de Reordenação**

| Operação | Descrição |
|----------|-----------|
| **Swap** | Troca a ordem de 2 itens específicos |
| **Move to Position** | Move item para posição específica |
| **Move Up** | Sobe uma posição |
| **Move Down** | Desce uma posição |
| **Move to Top** | Move para o início (posição 0) |
| **Move to Bottom** | Move para o final |

---

## 🌐 Endpoints da API

### **Frente** - `/v1/frente`

#### Trocar ordem de 2 frentes
```http
PATCH /v1/frente/swap-order
Content-Type: application/json

{
  "id1": "frente-id-1",
  "id2": "frente-id-2"
}
```

#### Mover para posição específica
```http
PATCH /v1/frente/:id/move-to-position
Content-Type: application/json

{
  "position": 3,
  "materiaId": "materia-id"
}
```

#### Mover uma posição acima
```http
PATCH /v1/frente/:id/move-up?materiaId=materia-id
```

#### Mover uma posição abaixo
```http
PATCH /v1/frente/:id/move-down?materiaId=materia-id
```

#### Mover para o topo
```http
PATCH /v1/frente/:id/move-to-top?materiaId=materia-id
```

#### Mover para o final
```http
PATCH /v1/frente/:id/move-to-bottom?materiaId=materia-id
```

---

### **Subject** - `/v1/subject`

#### Trocar ordem de 2 subjects
```http
PATCH /v1/subject/swap-order
Content-Type: application/json

{
  "id1": "subject-id-1",
  "id2": "subject-id-2"
}
```

#### Mover para posição específica
```http
PATCH /v1/subject/:id/move-to-position
Content-Type: application/json

{
  "position": 2,
  "frenteId": "frente-id"
}
```

#### Mover uma posição acima
```http
PATCH /v1/subject/:id/move-up?frenteId=frente-id
```

#### Mover uma posição abaixo
```http
PATCH /v1/subject/:id/move-down?frenteId=frente-id
```

#### Mover para o topo
```http
PATCH /v1/subject/:id/move-to-top?frenteId=frente-id
```

#### Mover para o final
```http
PATCH /v1/subject/:id/move-to-bottom?frenteId=frente-id
```

---

### **Content** - `/v1/content`

#### Trocar ordem de 2 contents
```http
PATCH /v1/content/swap-order
Content-Type: application/json

{
  "id1": "content-id-1",
  "id2": "content-id-2"
}
```

#### Mover para posição específica
```http
PATCH /v1/content/:id/move-to-position
Content-Type: application/json

{
  "position": 1,
  "subjectId": "subject-id"
}
```

#### Mover uma posição acima
```http
PATCH /v1/content/:id/move-up?subjectId=subject-id
```

#### Mover uma posição abaixo
```http
PATCH /v1/content/:id/move-down?subjectId=subject-id
```

#### Mover para o topo
```http
PATCH /v1/content/:id/move-to-top?subjectId=subject-id
```

#### Mover para o final
```http
PATCH /v1/content/:id/move-to-bottom?subjectId=subject-id
```

---

## 🏛️ Arquitetura

### **Camada Repository**

Métodos auxiliares criados para encapsular acesso ao banco:

```typescript
// FrenteRepository
async getMaxOrder(materiaId: string): Promise<number>
async findByMateria(materiaId: string): Promise<Frente[]>
async countByMateria(materiaId: string): Promise<number>

// SubjectRepository
async getMaxOrder(frenteId: string): Promise<number>
async findByFrente(frenteId: string): Promise<Subject[]>
async countByFrente(frenteId: string): Promise<number>

// ContentRepository
async getMaxOrder(subjectId: string): Promise<number>
async findBySubject(subjectId: string): Promise<Content[]>
async countBySubject(subjectId: string): Promise<number>
```

**Benefícios:**
- ✅ Encapsulamento da lógica de acesso ao banco
- ✅ Services não acessam o `model` diretamente
- ✅ Reutilização de código
- ✅ Facilita testes unitários

### **Camada Service**

Implementação da lógica de negócio para reordenação:

```typescript
// Métodos disponíveis em FrenteService, SubjectService e ContentService
swapOrder(id1: string, id2: string): Promise<void>
moveToPosition(id: string, position: number, parentId: string): Promise<void>
moveUp(id: string, parentId: string): Promise<void>
moveDown(id: string, parentId: string): Promise<void>
moveToTop(id: string, parentId: string): Promise<void>
moveToBottom(id: string, parentId: string): Promise<void>
```

### **Camada Controller**

Endpoints REST seguindo padrões RESTful:
- Operações de reordenação usam método `PATCH`
- Documentação Swagger completa com `@ApiResponse`
- Validação de entrada com DTOs

---

## 📦 DTOs

### **SwapOrderDTOInput**
```typescript
{
  id1: string;  // ID do primeiro item
  id2: string;  // ID do segundo item
}
```

### **MovePositionDTOInput (Frente)**
```typescript
{
  position: number;    // Nova posição (0-based)
  materiaId: string;   // ID da matéria pai
}
```

### **MovePositionDTOInput (Subject)**
```typescript
{
  position: number;   // Nova posição (0-based)
  frenteId: string;   // ID da frente pai
}
```

### **MovePositionDTOInput (Content)**
```typescript
{
  position: number;    // Nova posição (0-based)
  subjectId: string;   // ID do subject pai
}
```

---

## 💡 Exemplos de Uso

### Cenário 1: Reordenar Frentes

**Estado inicial:**
```
Frente A (order: 0)
Frente B (order: 1)
Frente C (order: 2)
Frente D (order: 3)
```

**Trocar B com D:**
```bash
curl -X PATCH http://localhost:3000/v1/frente/swap-order \
  -H "Content-Type: application/json" \
  -d '{
    "id1": "frente-b-id",
    "id2": "frente-d-id"
  }'
```

**Resultado:**
```
Frente A (order: 0)
Frente D (order: 1)  ← trocou
Frente C (order: 2)
Frente B (order: 3)  ← trocou
```

---

### Cenário 2: Mover Content para o topo

**Estado inicial:**
```
Content 1 (order: 0)
Content 2 (order: 1)
Content 3 (order: 2)  ← queremos mover este
Content 4 (order: 3)
```

**Mover Content 3 para o topo:**
```bash
curl -X PATCH http://localhost:3000/v1/content/content-3-id/move-to-top?subjectId=subject-id
```

**Resultado:**
```
Content 3 (order: 0)  ← moveu para o topo
Content 1 (order: 1)  ← todos deslocaram
Content 2 (order: 2)
Content 4 (order: 3)
```

---

### Cenário 3: Mover Subject para posição específica

**Estado inicial:**
```
Subject A (order: 0)
Subject B (order: 1)
Subject C (order: 2)
Subject D (order: 3)
Subject E (order: 4)  ← queremos mover para posição 1
```

**Mover Subject E para posição 1:**
```bash
curl -X PATCH http://localhost:3000/v1/subject/subject-e-id/move-to-position \
  -H "Content-Type: application/json" \
  -d '{
    "position": 1,
    "frenteId": "frente-id"
  }'
```

**Resultado:**
```
Subject A (order: 0)
Subject E (order: 1)  ← moveu para cá
Subject B (order: 2)  ← todos entre deslocaram
Subject C (order: 3)
Subject D (order: 4)
```

---

## 🔍 Algoritmo de Reordenação

### **moveToPosition()**

```typescript
1. Busca o item a ser movido e sua posição atual (oldPosition)
2. Se newPosition == oldPosition, retorna (nada a fazer)
3. Busca todos os itens do mesmo contexto (mesma matéria/frente/subject)
4. Se movendo para frente (newPosition < oldPosition):
   - Incrementa order de todos entre newPosition e oldPosition
5. Se movendo para trás (newPosition > oldPosition):
   - Decrementa order de todos entre oldPosition e newPosition
6. Define o novo order do item
7. Atualiza todos os itens afetados no banco
```

**Complexidade:** O(n) onde n é o número de itens no contexto

---

## ✅ Vantagens desta Abordagem

### vs Linked List (prev/next)

| Aspecto | Campo `order` | Linked List |
|---------|---------------|-------------|
| Complexidade de implementação | ⭐ Baixa | ⭐⭐⭐⭐⭐ Muito Alta |
| Performance de leitura | ⭐⭐⭐⭐⭐ Rápida | ⭐⭐ Lenta (múltiplos populates) |
| Performance de escrita | ⭐⭐⭐⭐ Boa | ⭐⭐ Múltiplas updates |
| Risco de corrupção | ⭐⭐⭐⭐⭐ Mínimo | ⭐⭐ Alto (ponteiros quebrados) |
| Manutenibilidade | ⭐⭐⭐⭐⭐ Fácil | ⭐⭐ Difícil |
| Suporte a drag & drop | ⭐⭐⭐⭐⭐ Nativo | ⭐⭐⭐ Requer adaptação |

### Benefícios

✅ **Simples e eficiente**
✅ **Ordenação nativa do MongoDB** com índice
✅ **Fácil de debugar** (apenas números)
✅ **Sem risco de inconsistência** de estrutura
✅ **Suporte nativo a queries** (`$gt`, `$lt`, etc)
✅ **Compatível com paginação**
✅ **Facilita implementação de filtros**

---

## 🧪 Testando os Endpoints

### Usando cURL

```bash
# Criar uma frente (será adicionada no final)
curl -X POST http://localhost:3000/v1/frente \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Mecânica",
    "materia": "materia-fisica-id"
  }'

# Listar frentes (ordenadas por order)
curl http://localhost:3000/v1/frente

# Trocar ordem
curl -X PATCH http://localhost:3000/v1/frente/swap-order \
  -H "Content-Type: application/json" \
  -d '{
    "id1": "frente-1-id",
    "id2": "frente-2-id"
  }'

# Mover para posição específica
curl -X PATCH http://localhost:3000/v1/frente/frente-id/move-to-position \
  -H "Content-Type: application/json" \
  -d '{
    "position": 2,
    "materiaId": "materia-id"
  }'
```

### Via Swagger

Acesse: `http://localhost:3000/api`

Todos os endpoints estão documentados com exemplos e podem ser testados diretamente pela interface.

---

## 📝 Notas Técnicas

### Transações
- As operações de reordenação atualizam múltiplos documentos
- Para garantir consistência em produção, considere usar transações do MongoDB
- Atualmente implementado sem transações para simplicidade

### Performance
- **Criar item**: O(1) - apenas busca max order
- **Listar ordenado**: O(n log n) - ordenação pelo índice
- **Swap**: O(1) - apenas 2 updates
- **Move to position**: O(n) - updates em batch

### Índices Recomendados
```javascript
// Otimiza queries de listagem ordenada
db.frentes.createIndex({ materia: 1, order: 1 })
db.subjects.createIndex({ frente: 1, order: 1 })
db.contents.createIndex({ subject: 1, order: 1 })
```

---

## 🚀 Melhorias Futuras

- [ ] Implementar reordenação em lote (drag & drop de múltiplos itens)
- [ ] Adicionar transações para garantir atomicidade
- [ ] Criar endpoint para reordenar array completo de uma vez
- [ ] Implementar cache de ordem para otimizar leituras
- [ ] Adicionar logs de auditoria de reordenações
- [ ] Implementar undo/redo de reordenações

---

## 📚 Referências

- [NestJS Documentation](https://docs.nestjs.com/)
- [Mongoose Schema](https://mongoosejs.com/docs/guide.html)
- [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/)

---

**Documentação gerada em:** 24 de Novembro de 2025  
**Versão:** 1.0.0  
**Autor:** Sistema VcNaFacul

