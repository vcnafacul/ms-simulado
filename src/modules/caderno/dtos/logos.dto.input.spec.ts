import { decodificarLogos } from './logos.dto.input';

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

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

  it('base64 inválido vira ausência, não exceção', () => {
    expect(decodificarLogos({ cursinho: '!!! não é base64 !!!' })).toEqual({});
  });

  it('string vazia vira ausência', () => {
    expect(decodificarLogos({ cursinho: '' })).toEqual({});
  });
});
