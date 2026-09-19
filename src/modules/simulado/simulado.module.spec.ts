import { RelatorioSimuladoEstudanteModule } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.module';
import { SimuladoModule } from './simulado.module';

describe('SimuladoModule — o fluxo online não gera linha de relatório', () => {
  it('não conhece a coleção de junção', () => {
    // Omissão DELIBERADA (card 08): simulado resolvido digitalmente entra no
    // histórico pessoal e no relatório genérico, que esta série não toca.
    // Só o fluxo de cartão vincula a cursinho/turma.
    const imports = (Reflect.getMetadata('imports', SimuladoModule) ??
      []) as unknown[];
    expect(imports).not.toContain(RelatorioSimuladoEstudanteModule);
  });
});
