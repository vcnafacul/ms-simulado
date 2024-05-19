import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import assert from 'assert';
import { AppModule } from 'src/app.module';
import { Localizacao } from 'src/modules/exame/enum/localizacao.enum';
import { ExameRepository } from 'src/modules/exame/exame.repository';
import { Exame } from 'src/modules/exame/exame.schema';
import { FrenteRepository } from 'src/modules/frente/frente.repository';
import { Frente } from 'src/modules/frente/frente.schema';
import { MateriaRepository } from 'src/modules/materia/materia.repository';
import { Materia } from 'src/modules/materia/materia.schema';
import { Edicao } from 'src/modules/prova/enums/edicao.enum';
import { ProvaRepository } from 'src/modules/prova/prova.repository';
import { Prova } from 'src/modules/prova/prova.schema';
import { Alternativa } from 'src/modules/questao/enums/alternativa.enum';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { QuestaoRepository } from 'src/modules/questao/questao.repository';
import { Questao } from 'src/modules/questao/questao.schema';
import { AnswerSimuladoDto } from 'src/modules/simulado/dtos/answer-simulado.dto.input';
import { AnswerDTO } from 'src/modules/simulado/dtos/answer.dto.input';
import { SimuladoRepository } from 'src/modules/simulado/repository/simulado.repository';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';
import { TipoSimulado } from 'src/modules/tipo-simulado/schemas/tipo-simulado.schema';
import { TipoSimuladoRepository } from 'src/modules/tipo-simulado/tipo-simulado.repository';
import { BaseRepository } from 'src/shared/base/base.repository';
import request from 'supertest';
import { HistoricoRepository } from '../historico.repository';
import { Historico } from '../historico.schema';

interface DataMemory {
  exames: Exame[];
  frentes: Frente[];
  materias: Materia[];
  questoes: Questao[];
  tipoSimulado: TipoSimulado;
  simulado: Simulado;
}

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let questaoRepository: BaseRepository<Questao>;
  let exameRepository: BaseRepository<Exame>;
  let frenteRepository: BaseRepository<Frente>;
  let materiaRepository: BaseRepository<Materia>;
  let tipoSimuladoRepository: BaseRepository<TipoSimulado>;
  let simuladoRepository: BaseRepository<Simulado>;
  let historicoRepository: BaseRepository<Historico>;
  let provaRepository: BaseRepository<Prova>;

  const dataMemory = {
    exames: [] as Exame[],
    frentes: [] as Frente[],
    materias: [] as Materia[],
    questoes: [] as Questao[],
    tipoSimulado: null as TipoSimulado,
    simulado: null as Simulado,
  } satisfies DataMemory;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    exameRepository = moduleFixture.get<BaseRepository<Exame>>(ExameRepository);
    frenteRepository =
      moduleFixture.get<BaseRepository<Frente>>(FrenteRepository);
    materiaRepository =
      moduleFixture.get<BaseRepository<Materia>>(MateriaRepository);
    questaoRepository =
      moduleFixture.get<BaseRepository<Questao>>(QuestaoRepository);
    tipoSimuladoRepository = moduleFixture.get<BaseRepository<TipoSimulado>>(
      TipoSimuladoRepository,
    );

    simuladoRepository =
      moduleFixture.get<BaseRepository<Simulado>>(SimuladoRepository);
    historicoRepository =
      moduleFixture.get<BaseRepository<Historico>>(HistoricoRepository);

    provaRepository = moduleFixture.get<BaseRepository<Prova>>(ProvaRepository);

    await setUp(dataMemory);
    await app.init();
  });

  afterAll(async () => {
    await app.close(); // Garante que o aplicativo seja fechado após cada teste
  });

  const setUp = async (dataMemory: DataMemory) => {
    dataMemory.exames.push(
      await exameRepository.create({
        nome: 'Exame Teste',
        localizacao: Localizacao.SP,
      }),
    );

    dataMemory.materias.push(
      await materiaRepository.create({
        nome: 'Materia Teste 1',
        enemArea: 'ENEM Area Teste 1',
      }),
    );

    dataMemory.materias.push(
      await materiaRepository.create({
        nome: 'Materia Teste 2',
        enemArea: 'ENEM Area Teste 2',
      }),
    );

    dataMemory.frentes.push(
      await frenteRepository.create({
        nome: 'Frente Teste 1',
        materia: dataMemory.materias[0],
      }),
    );

    dataMemory.frentes.push(
      await frenteRepository.create({
        nome: 'Frente Teste 2',
        materia: dataMemory.materias[0],
      }),
    );

    dataMemory.frentes.push(
      await frenteRepository.create({
        nome: 'Frente Teste 3',
        materia: dataMemory.materias[0],
      }),
    );

    dataMemory.frentes.push(
      await frenteRepository.create({
        nome: 'Frente Teste 4',
        materia: dataMemory.materias[0],
      }),
    );

    dataMemory.tipoSimulado = await tipoSimuladoRepository.create({
      nome: 'Tipo Simulado Teste',
      quantidadeTotalQuestao: 4,
      duracao: 10,
      regras: [],
    });

    const prova = await provaRepository.create({
      edicao: Edicao.Regular,
      tipo: dataMemory.tipoSimulado,
      simulados: [],
      questoes: [],
      inicialNumero: 1,
      aplicacao: 1,
      ano: 2020,
      exame: dataMemory.exames[0],
      nome: 'Prova Teste',
      totalQuestao: 95,
      totalQuestaoValidadas: 4,
      filename: 'filename',
      enemAreas: [EnemArea.Linguagens, EnemArea.CienciasHumanas],
    });

    dataMemory.questoes.push(
      await questaoRepository.create(
        _createQuestionMock(
          prova,
          dataMemory.materias[1],
          dataMemory.frentes[0],
          dataMemory.frentes[1],
          dataMemory.frentes[2],
        ),
      ),
    );

    dataMemory.questoes.push(
      await questaoRepository.create(
        _createQuestionMock(
          prova,
          dataMemory.materias[0],
          dataMemory.frentes[0],
        ),
      ),
    );

    dataMemory.questoes.push(
      await questaoRepository.create(
        _createQuestionMock(
          prova,
          dataMemory.materias[0],
          dataMemory.frentes[0],
          dataMemory.frentes[1],
        ),
      ),
    );

    dataMemory.questoes.push(
      await questaoRepository.create(
        _createQuestionMock(
          prova,
          dataMemory.materias[1],
          dataMemory.frentes[0],
          dataMemory.frentes[3],
        ),
      ),
    );

    dataMemory.simulado = await simuladoRepository.create({
      nome: 'Simulado Teste',
      descricao: 'Descricao Simulado Teste',
      questoes: dataMemory.questoes,
      tipo: dataMemory.tipoSimulado,
    });
  };

  const getHistoricos = async (page: number, limit: number) =>
    await historicoRepository.getAll({ page, limit });

  it('Cria Historico de Simulado', async () => {
    const resposta: AnswerDTO[] = [
      {
        questao: dataMemory.questoes[0]._id,
        alternativaEstudante: Alternativa.A,
      },
    ];

    await request(app.getHttpServer())
      .post('/v1/simulado/answer')
      .send({
        idEstudante: 1,
        idSimulado: dataMemory.simulado._id,
        respostas: resposta,
        tempoRealizado: 1,
      } satisfies AnswerSimuladoDto)
      .expect(201);

    const historicos = await getHistoricos(1, 40);

    assert.equal(historicos.data.length, 1);
    assert.equal(historicos.data[0].usuario, 1);
    assert.equal(
      historicos.data[0].simulado._id.toString(),
      dataMemory.simulado._id.toString(),
    );
    assert.equal(historicos.data[0].respostas.length, 4);
    historicos.data[0].respostas.forEach((r) => {
      if (r.questao._id.toString() === resposta[0].questao.toString()) {
        assert.equal(r.alternativaEstudante, resposta[0].alternativaEstudante);
      } else {
        assert.equal(r.alternativaEstudante, null);
      }
    });
    // Assert Aproveitamento
    // Simulado tem 4 questões
    // Resposta estudando só tem 1 questão e 1 acerto
    // 2 Materias - Materia Teste 1: 50% -- Materia Teste 2: 0%
    // 4 Frentes - Frente Teste1: 25% -- Frente Teste2: 50% -- Frente Teste3: 100% -- Frente Teste4: 0%
    // Aproveitamento Geral: 25%

    assert.equal(historicos.data[0].aproveitamento.geral, 0.25);
    assert.equal(historicos.data[0].aproveitamento.materias.length, 2);

    assert.equal(
      historicos.data[0].aproveitamento.materias.find(
        (m) => m.id.toString() === dataMemory.materias[0]._id.toString(),
      ).aproveitamento,
      0,
    );
    assert.equal(
      historicos.data[0].aproveitamento.materias.find(
        (m) => m.id.toString() === dataMemory.materias[1]._id.toString(),
      ).aproveitamento,
      0.5,
    );

    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[0].nome,
      dataMemory.frentes[0].nome,
    );
    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[0].aproveitamento,
      0.25,
    );

    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[1].nome,
      dataMemory.frentes[1].nome,
    );
    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[1].aproveitamento,
      0.5,
    );

    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[2].nome,
      dataMemory.frentes[2].nome,
    );
    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[2].aproveitamento,
      1,
    );

    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[3].nome,
      dataMemory.frentes[3].nome,
    );
    assert.equal(
      historicos.data[0].aproveitamento.materias[1].frentes[3].aproveitamento,
      0,
    );
  });
});

const _createQuestionMock = (
  prova: Prova,
  materia: Materia,
  frente: Frente,
  frente2?: Frente,
  frente3?: Frente,
) => {
  const questao = new Questao();
  questao.materia = materia;
  questao.frente1 = frente;
  questao.frente2 = frente2;
  questao.frente3 = frente3;
  questao.alternativa = Alternativa.A;
  questao.prova = prova;
  return questao;
};
