# O motivo da falha do cartão chega a quem usa

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/01-BUG-falha-do-cartao-nao-chega-a-ninguem.md`
> Repos: `ms-simulado` · `client-vcnafacul` — a **api não muda**
> Branch: `feature/01-motivo-da-falha-do-cartao`
> Depende de: `01b` (ms-omr PR #4), que criou os códigos granulares

---

## O problema

> Reportado: *"testei o envio do cartão algumas vezes, deu erro. Mas eu não sei o erro, pois só
> voltou que falhou."*

O ms-omr manda `motivo` e `detalhe` no callback. O ms-simulado recebe, grava `status: failed` e
**descarta o resto na linha seguinte** (`cartao-callback.service.ts:38`). A informação que
resolveria o chamado existe, trafega pela rede e é destruída.

## O que a análise encontrou além do card

O card foi escrito antes de o código ser lido a fundo. Três fatos mudam o desenho:

### 1. O canal de volta já existe

O card afirma que *"depois disso não existe canal de volta"* e que o canal serão os relatórios dos
cards `05`/`06`. Não é o caso: o `uploadCartaoModal` **já lista os históricos do aluno** quando se
busca a matrícula (`uploadCartaoModal.tsx:110-120`), mostrando hoje um `status` cru — `"failed"`,
sem mais nada.

E o caminho de dados já está aberto de ponta a ponta:

- `HistoricoRepository.getAllByUser` devolve o documento inteiro, **sem projeção**;
- `api-vcnafacul` é passthrough puro — `HistoricoService.getAllByUser` é um `axios.get` cru, e
  `cartao-resposta-resultados.service.ts` repassa `resultado.data` sem tocar.

Um campo novo no `Historico` chega ao client **sem uma linha na api**.

### 2. São seis pontos que gravam `Failed` sem motivo, não dois

O card nomeia dois. O código tem seis — três no fluxo de cartão e três no estágio de
processamento, que atingem também o fluxo online.

### 3. O `aguardar` do card ficou sem sentido

O `01b` fez o `motor_timeout` só chegar **depois** de esgotadas as três tentativas. A ação
`aguardar` prometia uma re-tentativa automática que não existe mais.

## Decisões tomadas

| ponto | decisão |
|---|---|
| Escopo no client | Mostra o motivo na lista que já existe no modal, além de corrigir o toast |
| Descrição e ação | **Derivadas do código na leitura.** O `Historico` grava só `codigo` + `detalhe` |
| `acaoSugerida` | `aguardar` vira **`reprocessar`**; valores finais: `reprocessar` · `reenviar_foto` · `falar_com_suporte` |
| Pontos cobertos | Os **seis**, incluindo o estágio de processamento |

⚠️ **Por que a descrição não é gravada.** O card diz *"guarde os três"* e, duas linhas depois,
justifica que *"o código é o que permite mudar o texto depois sem reprocessar nada"* — as duas
coisas não coexistem. Gravada, a descrição congela no instante da falha: ajustar uma frase passa a
exigir migração, e até lá duas frases diferentes convivem para o mesmo código. Derivada, um ajuste
de redação vale imediatamente para todo o histórico já gravado.

⚠️ **Por que `reprocessar` e não `reenviar_foto`.** `motor_timeout`, `armazenamento_indisponivel` e
`omr_indisponivel` não são culpa da foto. Pedir uma foto nova ali é o mesmo erro que o `01b`
consertou, na direção oposta: manda o cursinho refazer trabalho à toa. `reprocessar` significa
"tente de novo, a mesma foto serve".

---

## Desenho

### 1. O que é gravado — `Historico.falha`

```ts
// src/modules/historico/types/falha.ts
export class FalhaHistorico {
  public codigo: string;
  public detalhe?: string; // texto cru; inclui o stderr do OMRChecker em motor_falhou
}
```

```ts
@Prop({ type: Object, required: false })
@ApiProperty({ required: false })
public falha?: FalhaHistorico;
```

O repositório ganha:

```ts
async marcarFalha(id: string, codigo: string, detalhe?: string): Promise<void> {
  await this.model
    .findByIdAndUpdate(id, { status: HistoricoStatus.Failed, falha: { codigo, detalhe } })
    .exec();
}
```

⚠️ **Uma escrita, não duas.** O card `09` precisa da operação inversa — voltar o status e
`$unset` os campos de falha — e adverte que, em duas escritas, existe uma janela mostrando
"processando" com a mensagem de erro velha ao lado. Nascendo atômica aqui, ela já está certa lá.

O `updateStatus` genérico continua, para os usos que não são falha.

### 2. O catálogo — treze códigos, duas origens

Em `src/modules/historico/falha/`. Tabela explícita num `Record`, não `switch` espalhado.

| código | descrição | `acaoSugerida` |
|---|---|---|
| `imagem_nao_encontrada` | A foto do cartão não foi encontrada. Envie novamente. | `reenviar_foto` |
| `template_ausente` | O modelo de cartão deste simulado não está publicado. | `falar_com_suporte` |
| `cartao_nao_detectado` | Não foi possível localizar o cartão na foto. Refotografe com o cartão inteiro visível e boa iluminação. | `reenviar_foto` |
| `leitura_ausente` | O cartão foi processado, mas nenhuma marcação foi lida. Refotografe. | `reenviar_foto` |
| `motor_falhou` | Erro interno na leitura do cartão. | `falar_com_suporte` |
| `motor_timeout` | A leitura excedeu o tempo limite depois de três tentativas. Tente processar novamente. | `reprocessar` |
| `armazenamento_indisponivel` | Não foi possível acessar o arquivo do cartão. Tente processar novamente. | `reprocessar` |
| `erro_interno` | Erro inesperado ao processar o cartão. | `falar_com_suporte` |
| `omr_indisponivel` | Não foi possível acionar a leitura do cartão. Tente novamente. | `reprocessar` |
| `simulado_nao_encontrado` | O simulado deste cartão não foi encontrado. | `falar_com_suporte` |
| `respostas_ausentes` | O cartão foi lido, mas nenhuma resposta chegou para o cálculo. | `falar_com_suporte` |
| `simulado_sem_questoes` | Este simulado não tem questões cadastradas. | `falar_com_suporte` |
| `erro_no_processamento` | Erro ao calcular o resultado do cartão. | `falar_com_suporte` |

**Os oito primeiros vêm do ms-omr** — o `README.md` daquele repo é o contrato publicado, e o mapa
referencia esse documento num comentário.

**Os cinco últimos o ms-simulado produz sozinho**, e ficam num enum próprio
(`CodigoFalhaInterno`), porque ele precisa escrevê-los e um literal solto é typo esperando
acontecer.

⚠️ **Código desconhecido não pode virar tela em branco.** O caso padrão devolve *"Não foi possível
ler o cartão."* com `falar_com_suporte`, **e registra o código não mapeado em `warn`**. Sem o log,
um código novo do ms-omr some em silêncio. E `falar_com_suporte` é o fallback seguro: prometer que
uma segunda tentativa resolve, sem saber o que aconteceu, seria chute.

### 3. Onde a descrição nasce

Uma função pura:

```ts
export function descreverFalha(falha?: FalhaHistorico): FalhaDescrita | undefined
```

aplicada na **camada de serviço** do ms-simulado — `HistoricoService.getAllbyUser` e `getById`.

Nada é derivado no client: **nenhuma tela conhece código de erro.** É o que permite mudar um texto
ou uma ação sem tocar em nenhuma tela, e é por isso que a `acaoSugerida` vive junto do mapa.

**Por que na service e não num virtual do Mongoose.** Um virtual seria à prova de esquecimento,
mas não existe nenhum neste repo, e ligar `toJSON: { virtuals: true }` mudaria o shape de toda
resposta de `Historico`. A service já é o lugar onde este repo reformata saída —
`historico.service.ts:getById` faz `toObject()` e achata as questões.

⚠️ **O preço.** O card `02`, ao criar a consulta por simulado, **precisa chamar a mesma função**.
Sem isso, a coluna de erro dos cards `05`/`06` chega com o código cru em vez da descrição. Isto é
uma dependência explícita do `02`, não uma nota de rodapé.

### 4. Os seis pontos

| onde | código |
|---|---|
| `cartao-callback.service.ts:38` — falha vinda do ms-omr | o `motivo` recebido, repassado como está |
| `cartao-callback.service.ts:53` — simulado não encontrado | `simulado_nao_encontrado` |
| `cartao-historico.service.ts:48` — OMR inacessível no envio | `omr_indisponivel` |
| `simulado.service.ts:191` — sem `rawRespostas` | `respostas_ausentes` |
| `simulado.service.ts:206` — simulado sem questões | `simulado_sem_questoes` |
| `simulado.service.ts:250` — `catch` do processamento | `erro_no_processamento`, mensagem do erro no `detalhe` |

⚠️ **O primeiro repassa o código cru de propósito.** O ms-simulado **não** valida contra uma lista
fechada — senão todo código novo do ms-omr exigiria deploy coordenado dos dois repos, que é
exatamente o lockstep que o `01b` evitou. Quem absorve o desconhecido é o fallback do mapa.

### 5. O client

**DTO do callback.** `CartaoCallbackDtoInput.falha` troca o `@IsObject()` solto por um DTO
aninhado com `@ValidateNested`, para o `motivo` ser validado como string não vazia.

**A lista do modal** (`uploadCartaoModal.tsx`) troca o `status` cru pela descrição quando houver
falha. É o canal de volta que já existia e ninguém estava usando — e é o que responde à
reclamação que originou o card, sem esperar os cards `05`/`06`.

**O toast** para de afirmar sucesso: *"Cartão enviado. O resultado aparece aqui quando o
processamento terminar."* no lugar de *"Cartão enviado! Processando..."* em verde. O sucesso era do
**upload**, não da leitura.

⚠️ **Sem notificação em tempo real nesta rodada.** Não há websocket nem polling no projeto;
inventar um aqui triplicaria o card.

### 6. Testes

**ms-simulado**

- o mapa devolve descrição e ação para cada um dos treze códigos;
- código desconhecido cai no fallback **e loga em `warn`** — o log faz parte do critério;
- `marcarFalha` grava status e falha na **mesma** escrita;
- um teste por ponto de falha, cobrindo os seis;
- callback **sem** `falha` não inventa uma — é o teste que impede o mapa de virar default silencioso;
- `descreverFalha` aplicado em `getAllbyUser` e `getById`.

**client-vcnafacul**

- a lista renderiza a descrição quando há falha, e o status cru quando não há;
- o toast não afirma sucesso do processamento.

---

## Deploy

**ms-simulado → client.** A api não muda em nada.

Campo novo e opcional: **sem migração**.

⚠️ Históricos que já falharam ficam sem `falha` para sempre — a informação nunca existiu e não é
reconstruível. A lista mostra o status cru neles, como hoje.

## Fora de escopo

- A coluna de erro nos relatórios por turma e geral — cards `05`/`06`.
- O botão de reenviar foto e reprocessar — card `09`, que consome a `acaoSugerida` definida aqui.
- Notificação em tempo real do fim do processamento.
- Varredura de `awaiting_omr` órfãos — card próprio, já previsto no `09`.

## Critérios de aceite

- [ ] Cartão que falha grava **código + detalhe**; descrição e ação saem do mapa na leitura
- [ ] Os **seis** pontos de `Failed` gravam motivo
- [ ] Código desconhecido tem fallback visível **e** vai para o log
- [ ] A descrição é legível por um coordenador de cursinho — sem jargão de OMR
- [ ] Nenhuma tela conhece código de erro
- [ ] A tela de envio para de afirmar sucesso do que não sabe
- [ ] A lista do modal mostra o motivo da falha
- [ ] Callback sem `falha` não inventa uma
