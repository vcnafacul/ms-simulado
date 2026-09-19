import { RelatorioSimuladoEstudanteModule } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.module';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';
import { SimuladoModule } from './simulado.module';

// Copiado de caderno.module.spec.ts: `forwardRef(() => X)` chega na metadata
// como `{ forwardRef: () => X }`, não como `X` — um `.not.toContain(X)` simples
// não pega essa forma, então o desembrulho é necessário aqui também.
const desembrulhar = (importado: unknown): unknown =>
  typeof importado === 'object' &&
  importado !== null &&
  typeof (importado as { forwardRef?: unknown }).forwardRef === 'function'
    ? (importado as { forwardRef: () => unknown }).forwardRef()
    : importado;

describe('SimuladoModule — o fluxo online não gera linha de relatório', () => {
  it('não conhece a coleção de junção', () => {
    // Omissão DELIBERADA (card 08): simulado resolvido digitalmente entra no
    // histórico pessoal e no relatório genérico, que esta série não toca.
    // Só o fluxo de cartão vincula a cursinho/turma.
    const imports = (Reflect.getMetadata('imports', SimuladoModule) ??
      []) as unknown[];

    // `.not.toContain` sozinho não pegaria um `forwardRef(() => RelatorioSimuladoEstudanteModule)`,
    // que chega como `{forwardRef: [Function]}` — desembrulhamos cada entrada antes de comparar.
    const alvos = imports.map(desembrulhar);
    expect(alvos).not.toContain(RelatorioSimuladoEstudanteModule);

    const providers = (Reflect.getMetadata('providers', SimuladoModule) ??
      []) as unknown[];
    expect(providers).not.toContain(RelatorioSimuladoEstudanteRepository);
  });
});
