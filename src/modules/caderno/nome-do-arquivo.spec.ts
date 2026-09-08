import { nomeDoArquivo, slugDoSimulado } from './nome-do-arquivo';

describe('slugDoSimulado', () => {
  it('tira acento, baixa a caixa e troca o resto por hífen', () => {
    expect(slugDoSimulado('Simulão de Novembro!', 'abc123')).toBe(
      'simulao-de-novembro',
    );
    expect(slugDoSimulado('ENEM 1º dia — 2026', 'abc123')).toBe(
      'enem-1o-dia-2026',
    );
  });

  it('colapsa hífens e apara as pontas', () => {
    expect(slugDoSimulado('  ///Prova///  ', 'abc123')).toBe('prova');
    expect(slugDoSimulado('a...b', 'abc123')).toBe('a-b');
  });

  it('cai no simuladoId quando o nome saneia para vazio', () => {
    // Nome de simulado aceita acento, barra e dois-pontos, e nem todo sistema
    // de arquivos aceita. Um nome só de símbolos produziria um arquivo sem
    // nome nenhum.
    expect(slugDoSimulado('!!!', 'abc123')).toBe('abc123');
    expect(slugDoSimulado('', 'abc123')).toBe('abc123');
    expect(slugDoSimulado('   ', 'abc123')).toBe('abc123');
  });

  it('o resultado é sempre [a-z0-9-]', () => {
    for (const nome of [
      'Simulão!! de Nôvembro/2026',
      'ção çedilha ünïcode',
      'A:B\\C|D*E?F"G<H>I',
      '日本語',
      '1º lugar ½ ﬁnal',
    ]) {
      expect(slugDoSimulado(nome, 'abc123')).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('nomeDoArquivo', () => {
  it('junta slug, timestamp e extensão', () => {
    const nome = nomeDoArquivo(
      'Simulado de Novembro',
      'abc123',
      new Date('2026-09-08T14:32:07Z'),
    );
    expect(nome).toMatch(/^simulado-de-novembro-\d{8}-\d{4}\.zip$/);
  });

  it('o timestamp diferencia dois downloads seguidos', () => {
    // Não versiona nada no servidor: não guardamos zip, cada requisição
    // regenera. Serve para o download não virar `caderno (1).zip` na máquina
    // de quem baixou.
    const a = nomeDoArquivo('P', 'id', new Date('2026-09-08T14:32:00Z'));
    const b = nomeDoArquivo('P', 'id', new Date('2026-09-08T15:01:00Z'));
    expect(a).not.toBe(b);
  });

  it('nome impróprio não escapa para o Content-Disposition', () => {
    // O nome vai num header HTTP. Aspas ou quebra de linha ali permitiriam
    // injetar outro header.
    const nome = nomeDoArquivo('a"b\nc', 'id', new Date());
    expect(nome).toMatch(/^[a-z0-9-]+-\d{8}-\d{4}\.zip$/);
  });
});
