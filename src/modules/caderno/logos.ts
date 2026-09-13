import { ChaveDeLogo } from './templates';

/**
 * Os logos que vieram do api, já decodificados.
 *
 * Chave ausente = aquele logo não existe para este download. É estado normal,
 * não erro: quem baixa pode não ter cursinho (o caderno é liberado por
 * `visualizarProvas`, que não exige cursinho nenhum) ou o cursinho pode não
 * ter logo cadastrado.
 */
export type LogosDoCaderno = Partial<Record<ChaveDeLogo, Buffer>>;

// ⚠️ A ordem deste literal é a ordem dos avisos — o spec a afere.
const AVISO_POR_LOGO: Record<ChaveDeLogo, string> = {
  vnf: 'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
  cursinho: 'logo do cursinho não disponível — o cabeçalho sai sem a marca',
};

/**
 * A única definição de "este logo existe".
 *
 * ⚠️ **Zero byte conta como ausente.** `Buffer.alloc(0)` é objeto, logo
 * truthy: uma checagem por truthiness gravaria um arquivo vazio no zip, o
 * `\IfFileExists` do template passaria e o `\includegraphics` quebraria a
 * compilação no Overleaf — com o aviso dizendo que o logo está *ausente*,
 * mandando procurar no lugar errado.
 *
 * ⚠️ Mora aqui, e não em cada chamador, porque duas cópias da mesma regra é
 * como elas divergem — e o defeito da divergência é prova que não compila.
 */
export const temLogo = (buffer?: Buffer): buffer is Buffer => !!buffer?.length;

/**
 * Um aviso por logo ausente.
 *
 * Os avisos viram comentários `% AVISO:` no topo do `conteudo.tex`: invisíveis
 * no PDF, visíveis para quem abre no Overleaf. Sem eles, um cabeçalho sem a
 * marca do cursinho não tem explicação em lugar nenhum — e a pessoa vai
 * procurar o defeito no template.
 *
 * Um logo com zero bytes conta como ausente: um arquivo vazio passa na guard
 * `\IfFileExists` do template mas quebra o `\includegraphics`, sem nenhum aviso
 * explicando por que o cabeçalho saiu sem a marca.
 */
export function avisosDosLogos(logos: LogosDoCaderno | undefined): string[] {
  const presentes = logos ?? {};
  return (Object.keys(AVISO_POR_LOGO) as ChaveDeLogo[])
    .filter((chave) => !temLogo(presentes[chave]))
    .map((chave) => AVISO_POR_LOGO[chave]);
}
