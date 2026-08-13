# Calibração do cartão-resposta (Etapa 7 · Card 03)

Gerador em `src/modules/cartao-resposta/`. O `LayoutModel` (`layout/cartao-layout.ts`) é a
fonte da verdade de coordenadas; `template-json.builder.ts` e `cartao-pdf.builder.ts` derivam dele.

## Parâmetros usados (DEFAULT_CONFIG)

| Param | Valor | Nota |
|---|---|---|
| dpi | 300 | A4 = 2480×3508 px |
| markerSizePx / markerInsetPx | 120 / 100 | `near` = inset + size/2 = **160** |
| bubble (W×H) | 60×60 | círculo de contorno, raio ~26px |
| matrícula origin / labelsGap / bubblesGap | [340,900] / 95 / 78 | 8 colunas × 10 dígitos |
| respostas origin / labelsGap / bubblesGap | [230,1720] / 50 / 92 | N linhas × A–E |
| respostasColumnWidthPx / questionsPerColumn | 760 / 30 | N=90 → 3 colunas |
| QR box | x2000 y150 size320 | payload `{simuladoId,cursinhoId,templateVersion}` |

## Convenções do OMRChecker descobertas (críticas)

Duas correções de coordenadas foram necessárias pra leitura bater — ambas verificadas lendo
o código do OMRChecker vendorizado, não por tentativa e erro:

1. **`origin` = canto superior-esquerdo da caixa de amostra, não centro.**
   `core.py` amostra `img[y:y+box_h, x:x+box_w]` com `(x,y)=origin+índices·gaps`. O centro de
   amostragem é `origin + índices·gaps + bubbleDim/2`. Logo o `template.json` emite
   `origin = centroVisual − bubbleDim/2`. O PDF continua desenhando no centro visual.

2. **CropOnMarkers normaliza pela caixa dos CENTROS dos markers.**
   `CropOnMarkers.py` faz `four_point_transform` usando os centros dos 4 markers → a imagem lida
   vive no espaço da caixa dos centros, não no A4 inteiro. Logo:
   - `pageDimensions` = A4 − 2·near = **[2160, 3188]** (não 2480×3508).
   - As coordenadas dos fieldBlocks são relativas ao centro do marker superior-esquerdo (−`near`).
   - O PDF e o LayoutModel continuam em espaço A4; só o `template.json` é reexpresso no espaço
     normalizado.

   Consequência de layout: o conteúdo tem que caber **dentro** da caixa dos markers (acima dos
   markers de baixo, y ≤ 3348 em A4). Por isso `respostasLabelsGap` foi de 55 → 50.

## Validação automatizada

- **Consistência (ms-simulado):** `template-json.builder.spec.ts` prova que o centro de amostragem
  do OMRChecker (`origin + índices·gaps + bubbleDim/2 + near`) ≡ `LayoutModel.bubbleCenter` (centro
  visual do PDF).
- **Readback sintético (ms-omr):** `tests/test_cartao_readback.py` gera uma imagem sintética do
  `template.json`, roda o OMRChecker de verdade via `run_omr`, e lê de volta matrícula `12345678` +
  q1=A, q2=E, q30=C, q61=D (cobrindo as 3 colunas). **PASSA.**

## Pré-requisitos de captura (foto/scan manual)

- Cartão inteiro visível, com os **4 markers** nos cantos sem corte.
- Iluminação uniforme, sem brilho/reflexo forte sobre as bolhas.
- Foto reta (sem perspectiva acentuada) ou scanner a **≥ 200 dpi**.
- Preencher a bolha **completamente** (o círculo inteiro), caneta escura.

## Taxa de acerto real (impressão + foto manual)

Primeiro teste real — cartão impresso (5 colunas × 18, bolhas redondas), preenchido à mão
com caneta preta e **fotografado com celular** (com perspectiva/inclinação):

| Amostra | Captura | Matrícula | Respostas | Observações |
|---|---|---|---|---|
| 2026-08-13 | foto celular | `20260001` ✓ | ~100% ✓ | perspectiva corrigida pelos markers; dupla marcação (q39 A+E) detectada corretamente; coluna toda-C lida certa |

**Conclusão:** pipeline ponta-a-ponta validado (gerador → impressão → preenchimento → foto → `run_omr`).
Foto de celular com perspectiva foi corrigida pelos 4 markers. Matrícula e respostas visíveis batem
com a leitura.

## ⚠️ Bug de layout achado no teste: coluna 5 encosta no limite dos markers

A distribuição `respostasEvenColumns` espalha as colunas pela **largura da página inteira**, mas os
markers ficam a `near = markerInset + markerSize/2` da borda. Com `respostasBubblesGap` largo, a caixa
de amostragem da alternativa E da **coluna 5** ultrapassa a caixa dos markers (`pageDimensions`), e o
OMRChecker **recusa o template** (`Overflowing field block 'respostas_c5'`).

- **Workaround no teste:** reduzir `bubbleDimensions` no template.json (40→24) — cabe sem mexer nas
  posições. Só pra destravar a leitura deste cartão já impresso.
- **Correção pro config (reimpressão):** reduzir `respostasBubblesGap` (ex.: **75 → 64**) → dá ~22px de
  folga e o gerador para de avisar. (Reduzir markerSize quase não ajuda; bubble menor idem — o que
  puxa a coluna 5 pra dentro é o gap A–E menor.)
- **Correção arquitetural (futuro):** distribuir as colunas dentro da **caixa dos markers**, não da
  página inteira, garantindo que nada caia no/além do marker. Trade-off com "margem da página = vão".

> Calibração fina por categoria (N real, ajuste de bolha/gaps contra prints reais) = Ticket A.
