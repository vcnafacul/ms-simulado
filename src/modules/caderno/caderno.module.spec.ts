import { CadernoModule } from './caderno.module';

/**
 * ⚠️ Este teste olha a METADATA dos módulos, não instancia nada.
 *
 * Compilar o `CadernoModule` de verdade arrastaria o `SimuladoModule` e os
 * `MongooseModule.forFeature`, que exigem uma conexão registrada em
 * `AppModule` — a suíte passaria a depender de um Mongo rodando. Mockar o
 * `SimuladoModule` resolveria o boot, mas deixaria de exercitar justamente o
 * que interessa: a ordem em que os `require` acontecem.
 *
 * Ciclo de módulo no Nest não quebra o build nem os testes unitários. Quebra no
 * boot, com um `undefined` no array de `imports` — que é exatamente o que esta
 * varredura procura, e é como o elo sem `forwardRef` entre `ProvaModule` e
 * `SimuladoModule` foi descoberto: ele só aparecia quando a cadeia de require
 * começava pelo caderno, e não pelo `ProvaModule`.
 */
describe('CadernoModule — árvore de imports', () => {
  it('nenhum módulo da árvore chega undefined', () => {
    const vistos = new Set<unknown>();
    const problemas: string[] = [];

    const visitar = (modulo: unknown, caminho: string): void => {
      if (!modulo || vistos.has(modulo)) return;
      vistos.add(modulo);

      const importados: unknown[] =
        Reflect.getMetadata('imports', modulo as object) ?? [];

      importados.forEach((importado, i) => {
        if (importado === undefined || importado === null) {
          problemas.push(`${caminho} > imports[${i}] é ${String(importado)}`);
          return;
        }

        // `forwardRef(() => X)` chega como `{ forwardRef: () => X }`.
        const alvo =
          typeof importado === 'object' &&
          typeof (importado as { forwardRef?: unknown }).forwardRef ===
            'function'
            ? (importado as { forwardRef: () => unknown }).forwardRef()
            : importado;

        // Módulo dinâmico (`MongooseModule.forFeature(...)`) é objeto, não
        // classe: não tem árvore própria para varrer.
        if (typeof alvo === 'function') {
          visitar(alvo, `${caminho} > ${(alvo as { name: string }).name}`);
        }
      });
    };

    visitar(CadernoModule, 'CadernoModule');
    expect(problemas).toEqual([]);
  });
});
