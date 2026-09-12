import JSZip from 'jszip';

/**
 * ⚠️ **Os limites existem contra zip bomb, e por isso a ORDEM importa.**
 *
 * `zipBytes` e `entradas` são checados **antes** de descompactar qualquer
 * coisa. Um zip de 200 MB ou com 5000 entradas que só fosse recusado depois de
 * lido para a memória é o zip bomb funcionando exatamente como projetado.
 */
export const LIMITES = {
  zipBytes: 5 * 1024 * 1024,
  arquivoBytes: 256 * 1024,
  entradas: 200,
} as const;

/** Os únicos dois arquivos que saem do zip. O resto do projeto é ignorado. */
const ALVOS = ['main.tex', 'preambulo.tex'] as const;

export type ResultadoDaExtracao =
  | { ok: true; arquivos: Record<string, string>; ignorados: string[] }
  | { ok: false; erro: string };

/** Caractere de controle no nome: nunca vem de um projeto de verdade. */
const CONTROLE = /[\u0000-\u001f]/;

function recusa(erro: string): ResultadoDaExtracao {
  return { ok: false, erro };
}

/**
 * ⚠️ **Nome de entrada de zip é entrada de usuário.** No card 11 ele vira
 * caminho na montagem do zip da prova, e aí um `..` é path traversal. Além
 * disso: um zip com uma entrada dessas não é um projeto do Overleaf, é outra
 * coisa — então rejeita o ZIP INTEIRO, não só a entrada.
 *
 * ⚠️ Vale também para entradas de **diretório**. O JSZip normaliza o `..` na
 * escrita (`../x.tex` vira a entrada `x.tex` mais o diretório `/`), então quem
 * denuncia a travessia nesse caso é a barra inicial do diretório.
 */
function nomePerigoso(caminho: string): boolean {
  if (CONTROLE.test(caminho)) return true;
  if (caminho.startsWith('/') || caminho.startsWith('\\')) return true;
  if (/^[a-zA-Z]:/.test(caminho)) return true;
  return caminho.split(/[/\\]/).some((segmento) => segmento === '..');
}

function nomeBase(caminho: string): string {
  const partes = caminho.split(/[/\\]/);
  return partes[partes.length - 1];
}

/**
 * Abre o zip que o Overleaf entrega e tira dele só `main.tex` e
 * `preambulo.tex`. O resto do projeto — `conteudo.tex`, `metadados.tex`,
 * `assets/`, o `main.pdf`, os auxiliares — sai em `ignorados`, para a tela
 * poder mostrar o que **não** subiu.
 *
 * Peça pura: sem Mongo, sem HTTP, sem Nest. Erro é valor de retorno, nunca
 * exceção.
 *
 * ⚠️ **Busca por `basename`, case-insensitive.** O Overleaf entrega ora na
 * raiz, ora dentro de uma pasta com o nome do projeto, dependendo de onde a
 * pessoa clica. A chave do resultado é sempre minúscula: quem consome não deve
 * ter de descobrir a caixa do upload.
 *
 * ⚠️ **Duas entradas casando o mesmo alvo** (`main.tex` e `src/Main.tex`): a
 * última vence e a anterior **não** entra em `ignorados` — ela foi
 * considerada, não descartada. Não é caso a tratar; é caso a não esconder.
 */
export async function extrairTemplateDoZip(
  buffer: Buffer,
): Promise<ResultadoDaExtracao> {
  // 1. ANTES do loadAsync. Recusar depois de descompactar não protege de nada.
  if (buffer.length > LIMITES.zipBytes) {
    return recusa(
      `O arquivo tem ${buffer.length} bytes e o tamanho máximo é 5 MB.`,
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return recusa('Não consegui abrir o arquivo: ele não é um zip válido.');
  }

  // 2. Só o índice do zip foi lido até aqui. Contar antes de qualquer async().
  const entradas: { caminho: string; entrada: JSZip.JSZipObject }[] = [];
  zip.forEach((caminho, entrada) => {
    entradas.push({ caminho, entrada });
  });

  if (entradas.length > LIMITES.entradas) {
    return recusa(
      `O zip tem ${entradas.length} entradas e o máximo é ${LIMITES.entradas}.`,
    );
  }

  if (entradas.some(({ caminho }) => nomePerigoso(caminho))) {
    return recusa(
      'O zip tem uma entrada com caminho inválido e por isso foi recusado inteiro.',
    );
  }

  const achados: Record<string, JSZip.JSZipObject> = {};
  const caminhoDe: Record<string, string> = {};
  const ignorados: string[] = [];

  for (const { caminho, entrada } of entradas) {
    if (entrada.dir) continue;
    const alvo = nomeBase(caminho).toLowerCase();
    if ((ALVOS as readonly string[]).includes(alvo)) {
      achados[alvo] = entrada;
      caminhoDe[alvo] = caminho;
    } else {
      ignorados.push(caminho);
    }
  }

  const faltando = ALVOS.filter((alvo) => !achados[alvo]);
  if (faltando.length > 0) {
    // ⚠️ Nomeia só o que faltou. Citar o que ESTAVA lá manda a pessoa procurar
    // o arquivo certo.
    return recusa(`Faltou ${faltando.join(' e ')} no zip do Overleaf.`);
  }

  const arquivos: Record<string, string> = {};
  for (const alvo of ALVOS) {
    const caminho = caminhoDe[alvo];
    const bytes: Buffer = await achados[alvo].async('nodebuffer');

    if (bytes.length > LIMITES.arquivoBytes) {
      return recusa(
        `${caminho} tem ${bytes.length} bytes e o máximo por arquivo é 256 KB.`,
      );
    }

    try {
      // ⚠️ NUNCA `bytes.toString('utf-8')`: ele troca byte inválido por U+FFFD
      // calado, e a prova sai com um losango preto no meio do enunciado.
      arquivos[alvo] = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return recusa(`${caminho} não está em UTF-8.`);
    }
  }

  return { ok: true, arquivos, ignorados };
}
