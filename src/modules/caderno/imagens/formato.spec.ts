import { extensaoDosBytes } from './formato';

const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pdf = () => Buffer.from('%PDF-1.7\n');
const gif = () => Buffer.from('GIF89a');
const webp = () =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP'),
  ]);

describe('extensaoDosBytes — o que o pdflatex inclui', () => {
  it('reconhece PNG, JPEG e PDF', () => {
    expect(extensaoDosBytes(png())).toBe('png');
    expect(extensaoDosBytes(jpeg())).toBe('jpeg');
    expect(extensaoDosBytes(pdf())).toBe('pdf');
  });
});

describe('extensaoDosBytes — o que ele NÃO inclui', () => {
  it('recusa GIF e WEBP', () => {
    // O pdflatex não inclui nenhum dos dois. Deixar passar produziria um
    // arquivo válido com nome plausível que quebra a compilação — pior que
    // recusar, porque o defeito aparece longe da causa.
    expect(extensaoDosBytes(gif())).toBeNull();
    expect(extensaoDosBytes(webp())).toBeNull();
  });

  it('recusa bytes que não casam nada', () => {
    expect(extensaoDosBytes(Buffer.from('não sou imagem nenhuma'))).toBeNull();
  });
});

describe('extensaoDosBytes — bordas', () => {
  it('não estoura com buffer curto demais para a assinatura', () => {
    expect(extensaoDosBytes(Buffer.alloc(0))).toBeNull();
    expect(extensaoDosBytes(Buffer.from([0x89]))).toBeNull();
    expect(extensaoDosBytes(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(extensaoDosBytes(Buffer.from('RIFF'))).toBeNull();
  });

  it('não confunde RIFF que não é WEBP', () => {
    // RIFF é contêiner genérico (WAV também é RIFF). Só os 4 bytes iniciais
    // não bastam para dizer que é WEBP — e nem WEBP nós aceitamos, mas o
    // reconhecimento precisa ser correto para o aviso dizer a verdade.
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WAVE'),
    ]);
    expect(extensaoDosBytes(wav)).toBeNull();
  });
});
