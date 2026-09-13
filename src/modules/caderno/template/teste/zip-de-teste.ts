import { gerarCaderno } from '../../gerador/gerar-caderno';
import { ImagemRef } from '../../gerador/tipos';
import { ArquivoDoZip } from '../../imagens/tipos';
import { montarZip } from '../../zip';
import { lerFiguraExemplo } from './figura-exemplo';
import { SIMULADO_DE_TESTE } from './simulado-de-teste';

/**
 * O zip modelo do template: os mesmos arquivos do zip da prova, com conteúdo
 * fabricado.
 *
 * Fecha o ciclo do card 10 — o que sai daqui, editado no Overleaf, é o que
 * volta pelo upload de lá — e serve para conferir uma versão antiga antes de
 * restaurá-la.
 *
 * ⚠️ **Roda o gerador de verdade** em cima do `SIMULADO_DE_TESTE`, em vez de
 * carregar um `conteudo.tex` pronto: assim o zip de teste exercita o template
 * e o gerador ATUAIS, juntos. Um `.tex` estático desatualiza em silêncio, que
 * foi o que aconteceu com o `templates/v1/exemplo/`.
 *
 * ⚠️ **Função pura de um `Record<string, string>`** — nada de provider. É por
 * isso que o `CadernoTemplateModule` não precisa importar o `CadernoModule`, e
 * portanto não há ciclo entre os dois.
 */
export async function montarZipDeTeste(
  template: Record<string, string>,
): Promise<Buffer> {
  // ⚠️ **Sempre `draft: true`**, independente de `CADERNO_DRAFT_ENABLED`.
  // Aquele gate mora no `CadernoService.gerarZip` e protege outra coisa —
  // gerar prova a partir de simulado incompleto. Aqui a marca d'água é o que
  // impede um zip de teste de virar prova impressa, e isso não pode depender
  // de flag de ambiente.
  const { conteudo, metadados, imagens } = gerarCaderno(SIMULADO_DE_TESTE, {
    draft: true,
  });

  return await montarZip({
    template,
    conteudo,
    metadados,
    imagens: resolverLocalmente(imagens),
  });
}

/**
 * Toda referência de imagem vira a mesma figura commitada.
 *
 * ⚠️ **Sem `ResolverDeImagens`**: sem Redis, sem R2, sem rede. Um teste de
 * template que depende de infra externa deixa de testar o template e passa a
 * testar a infra — e falharia por motivo nenhum a ver com o layout.
 *
 * ⚠️ **Todas as refs, não só a primeira.** Hoje o mock tem uma imagem; se
 * ganhar outra, um mapeamento que só atendesse `imagens[0]` deixaria a segunda
 * sem arquivo e o LaTeX pararia com `File not found` — a falha que o card 03
 * existe para impedir. O nome sai de `ref.arquivo` (`assets/NN`, sem
 * extensão), nunca do índice.
 */
export function resolverLocalmente(refs: ImagemRef[]): ArquivoDoZip[] {
  return refs.map((ref) => ({
    nome: `${ref.arquivo}.png`,
    buffer: lerFiguraExemplo(),
  }));
}
