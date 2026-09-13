import { NOMES_DOS_LOGOS } from './templates';
import { avisosDosLogos } from './logos';

describe('NOMES_DOS_LOGOS', () => {
  it('mapeia chave semântica para nome de arquivo na raiz do zip', () => {
    expect(NOMES_DOS_LOGOS).toEqual({
      vnf: 'logo_vnf.png',
      cursinho: 'logo_cursinho.png',
    });
  });

  it('não põe logo em subpasta — a raiz é plana', () => {
    for (const nome of Object.values(NOMES_DOS_LOGOS)) {
      expect(nome).not.toContain('/');
    }
  });
});

describe('avisosDosLogos', () => {
  it('não avisa nada quando os dois vieram', () => {
    expect(
      avisosDosLogos({ vnf: Buffer.from('a'), cursinho: Buffer.from('b') }),
    ).toEqual([]);
  });

  it('avisa o logo do cursinho ausente', () => {
    expect(avisosDosLogos({ vnf: Buffer.from('a') })).toEqual([
      'logo do cursinho não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  it('avisa o logo do VNF ausente', () => {
    expect(avisosDosLogos({ cursinho: Buffer.from('b') })).toEqual([
      'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  it('avisa os dois, VNF primeiro', () => {
    expect(avisosDosLogos({})).toEqual([
      'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
      'logo do cursinho não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  it('trata `logos` ausente como os dois ausentes', () => {
    expect(avisosDosLogos(undefined)).toEqual([
      'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
      'logo do cursinho não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  it('trata logo com zero bytes como ausente', () => {
    expect(avisosDosLogos({ cursinho: Buffer.alloc(0) })).toEqual([
      'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
      'logo do cursinho não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  // ⚠️ Quebra de linha dentro de um aviso encerra o comentário LaTeX e joga o
  // resto dentro do documento, impresso na prova.
  it('nenhum aviso tem quebra de linha', () => {
    for (const aviso of avisosDosLogos({})) {
      expect(aviso).not.toMatch(/[\r\n]/);
    }
  });
});
