import 'reflect-metadata';
import { decodificarLogos } from './logos.dto.input';

// Full PNG signature (8 bytes)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_B64 = PNG.toString('base64');

describe('decodificarLogos', () => {
  it('decodifica as duas chaves', () => {
    const logos = decodificarLogos({ vnf: PNG_B64, cursinho: PNG_B64 });

    expect(logos.vnf).toEqual(PNG);
    expect(logos.cursinho).toEqual(PNG);
  });

  it('chave ausente fica ausente', () => {
    expect(decodificarLogos({ vnf: PNG_B64 })).toEqual({ vnf: PNG });
  });

  // ⚠️ O api sempre omite a chave; tolerar `null` é para quem escrever outro
  // cliente depois não descobrir a diferença em produção.
  it('tolera null explícito', () => {
    expect(decodificarLogos({ vnf: PNG_B64, cursinho: null })).toEqual({
      vnf: PNG,
    });
  });

  it('corpo ausente vira objeto vazio', () => {
    expect(decodificarLogos(undefined)).toEqual({});
  });

  it('ignora chave desconhecida', () => {
    expect(
      decodificarLogos({ vnf: PNG_B64, qualquer: PNG_B64 } as never),
    ).toEqual({ vnf: PNG });
  });

  // ⚠️ O DTO deliberadamente NÃO tem `@IsBase64()`: um logo ruim não pode
  // custar a prova inteira. Base64 malformado e bytes que não são imagem
  // devem degradar para ausência, não 400. Aqui é a porta única de validação.
  it('base64 inválido vira ausência, não exceção', () => {
    expect(decodificarLogos({ cursinho: '!!! não é base64 !!!' })).toEqual({});
  });

  it('string vazia vira ausência', () => {
    expect(decodificarLogos({ cursinho: '' })).toEqual({});
  });

  it('base64 válido mas não imagem vira ausência', () => {
    // 'abc' é base64 válido que decodifica para 2 bytes sem magic, e
    // 'hello world' é também válido mas não tem magic de PNG/JPEG/PDF
    expect(decodificarLogos({ vnf: 'abc' })).toEqual({});
    expect(
      decodificarLogos({ cursinho: Buffer.from('hello world').toString('base64') }),
    ).toEqual({});
  });
});
