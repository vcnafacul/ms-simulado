/**
 * Mede o custo de trazer `aproveitamento` inteiro no relatório (card 02).
 *
 * O docblock do `CAMPOS_DO_HISTORICO` obriga MEDIR antes de acrescentar campo,
 * em vez de presumir. Este script é a medição — rode com:
 *
 *   npx ts-node scripts/medir-payload-relatorio.ts
 *
 * ⚠️ Dados sintéticos calibrados pelo pior caso realista, e não uma turma de
 * produção (que eu não tenho acesso para consultar). O que ele mede é a ORDEM
 * DE GRANDEZA da troca, que é o que a decisão precisa: o número exato varia com
 * o tamanho dos nomes de matéria e a contagem de frentes.
 */
const ESTUDANTES = 100;
const MATERIAS = 9;
const FRENTES_POR_MATERIA = 3;
const QUESTOES = 90;

const oid = () => '665f0c1a2b3c4d5e6f00abc2';

/** Nomes reais do domínio, e não lorem: o tamanho deles É o custo medido. */
const NOMES_MATERIA = [
  'Matemática',
  'Física',
  'Química',
  'Biologia',
  'História',
  'Geografia',
  'Português',
  'Literatura',
  'Inglês',
];
const NOMES_FRENTE = ['Álgebra', 'Geometria', 'Trigonometria'];

function materias() {
  return Array.from({ length: MATERIAS }, (_, m) => ({
    id: oid(),
    nome: NOMES_MATERIA[m % NOMES_MATERIA.length],
    aproveitamento: 0.6234567,
    frentes: Array.from({ length: FRENTES_POR_MATERIA }, (_, f) => ({
      id: oid(),
      nome: NOMES_FRENTE[f % NOMES_FRENTE.length],
      materia: oid(),
      aproveitamento: 0.5432109,
    })),
  }));
}

/**
 * Sem o `materia` de dentro de cada frente: a frente já está ANINHADA na
 * matéria, então esse id é puro eco — 27 ObjectIds por estudante.
 */
function materiasSemEco() {
  return Array.from({ length: MATERIAS }, (_, m) => ({
    id: oid(),
    nome: NOMES_MATERIA[m % NOMES_MATERIA.length],
    aproveitamento: 0.6234567,
    frentes: Array.from({ length: FRENTES_POR_MATERIA }, (_, f) => ({
      id: oid(),
      nome: NOMES_FRENTE[f % NOMES_FRENTE.length],
      aproveitamento: 0.5432109,
    })),
  }));
}

/**
 * A alternativa: nomes num dicionário no topo, e a linha carrega só id + nota.
 * Cada estudante repete os MESMOS 9 nomes de matéria e 27 de frente — é essa
 * redundância que domina o payload.
 */
function materiasEnxutas() {
  return Array.from({ length: MATERIAS }, () => ({
    id: oid(),
    aproveitamento: 0.6234567,
    frentes: Array.from({ length: FRENTES_POR_MATERIA }, () => ({
      id: oid(),
      aproveitamento: 0.5432109,
    })),
  }));
}

function respostas() {
  return Array.from({ length: QUESTOES }, () => ({
    questao: oid(),
    alternativaEstudante: 'A',
    alternativaCorreta: 'C',
  }));
}

const base = () => ({
  usuario: '9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f',
  turmaId: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  historicoId: oid(),
  status: 'completed',
  cartaoCode: '127',
  questoesRespondidas: 87,
  aproveitamentoGeral: 0.6234567,
});

const kb = (o: unknown) =>
  `${(Buffer.byteLength(JSON.stringify(o), 'utf8') / 1024).toFixed(1)} KB`;

const linhas = (extra: (n: number) => object) =>
  Array.from({ length: ESTUDANTES }, (_, i) => ({ ...base(), ...extra(i) }));

const so_geral = linhas(() => ({}));
const com_materias = linhas(() => ({ aproveitamentoPorMateria: materias() }));
const com_respostas = linhas(() => ({ respostas: respostas() }));
const enxuto = {
  dicionario: Object.fromEntries(
    [...NOMES_MATERIA, ...NOMES_FRENTE].map((n) => [oid() + n, n]),
  ),
  linhas: linhas(() => ({ aproveitamentoPorMateria: materiasEnxutas() })),
};

console.log(
  `${ESTUDANTES} estudantes, ${MATERIAS} matérias × ${FRENTES_POR_MATERIA} frentes, ${QUESTOES} questões\n`,
);
for (const [nome, payload] of [
  ['só aproveitamento.geral   ', so_geral],
  ['aproveitamento inteiro    ', com_materias],
  [
    'sem o eco de `materia`    ',
    linhas(() => ({ aproveitamentoPorMateria: materiasSemEco() })),
  ],
  ['nomes num dicionário      ', enxuto],
  ['com respostas (referência)', com_respostas],
] as const) {
  const total = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  console.log(
    `${nome} ${kb(payload).padStart(9)}   (${Math.round(total / ESTUDANTES)} B por linha)`,
  );
}
