import * as fs from 'fs';
import { gerarCaderno } from '../../gerador/gerar-caderno';
import { CAMINHO_FIGURA_EXEMPLO, lerFiguraExemplo } from './figura-exemplo';
import { SIMULADO_DE_TESTE } from './simulado-de-teste';

describe('o simulado de teste', () => {
  it('tem as 6 questões, numeradas a partir de 46', () => {
    // 46 porque é o segundo dia do ENEM — e foi exatamente aí que um bug de
    // `faltantes` apareceu no card 02. O mock exercita a numeração real.
    expect(SIMULADO_DE_TESTE.questoes.map((q) => q.numero)).toEqual([
      46, 47, 48, 49, 50, 51,
    ]);
  });

  it('a categoria não tem alvo de quantidade', () => {
    // ⚠️ Medido em gerar-caderno.ts:146-167: com um alvo numérico, o modo
    // draft calcula `faltantes` a partir do menor número presente — seis
    // questões começando em 46 contra um alvo de 90 fariam o zip de teste
    // anunciar 84 pendências que não existem.
    expect(SIMULADO_DE_TESTE.categoria.quantidadeTotalQuestao).toBeNull();
  });

  it('o título avisa que não é prova', () => {
    expect(SIMULADO_DE_TESTE.nome).toContain('TEMPLATE DE TESTE');
  });
});

describe('o que o gerador faz com ele', () => {
  const gerado = () => gerarCaderno(SIMULADO_DE_TESTE, { draft: true });

  it('sai uma imagem só, e ela vem do nosso bucket, não da internet', () => {
    // ⚠️ `asset://` e não `https://`: se algum dia alguém ligar o resolvedor
    // real neste caminho por engano, asset:// bate no R2 e da 404 — enquanto
    // https:// faria um endpoint de TESTE emitir requisição de saída.
    const { imagens } = gerado();
    expect(imagens).toHaveLength(1);
    expect(imagens[0].origem).toBe('r2');
    expect(imagens[0].arquivo).toBe('assets/01');
  });

  it('a questão sem texto nas alternativas gera aviso', () => {
    // É o caso dominante do acervo medido, e o que produz a caixa cinza. Um
    // template de teste que não o mostrasse esconderia o problema mais comum.
    expect(gerado().avisos.length).toBeGreaterThan(0);
  });

  it('em draft, o metadados LIGA a marca d’água', () => {
    // ⚠️ `\cadernoRascunho` é um \newif: liga com \cadernoRascunhotrue. A
    // forma \def\cadernoRascunho{true} — que o card sugeria — não liga nada e
    // não dá erro, e a marca d'água simplesmente não aparece.
    expect(gerado().metadados).toContain('\\cadernoRascunhotrue');
  });

  it('não anuncia pendência nenhuma', () => {
    expect(gerado().questoesFaltantes).toEqual([]);
  });

  it('o conteúdo tem os seis blocos', () => {
    expect(gerado().conteudo.match(/\\question/g)).toHaveLength(6);
  });
});

describe('a figura de exemplo', () => {
  it('existe, é PNG e é pequena', () => {
    const bytes = lerFiguraExemplo();
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(bytes.length).toBeLessThan(20 * 1024);
  });

  it('NÃO é o placeholder de imagem indisponível', () => {
    // A caixa cinza significa falha, e o LEIA-ME explica isso. Usá-la como
    // imagem bem-sucedida faria o coordenador achar que o teste quebrou.
    const placeholder = fs.readFileSync(
      require.resolve('../../imagens/imagem-indisponivel.png'),
    );
    expect(lerFiguraExemplo().equals(placeholder)).toBe(false);
  });

  it('o caminho aponta para dentro do módulo', () => {
    expect(CAMINHO_FIGURA_EXEMPLO).toContain('template/teste');
  });
});
