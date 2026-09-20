import { ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ConsultarHistoricoDtoInput } from '../modules/historico/dtos/consultar-historico.dto.input';
import {
  GetAllDtoInput,
  LIMITE_MAXIMO,
} from '../shared/dtos/get-all.dto.input';
import { VALIDATION_PIPE_OPTIONS } from './validation-pipe.config';

// ⚠️ O pipe e montado a partir da constante que o `main.ts` usa, de proposito.
// Reescrever as opcoes a mao aqui tornaria o teste decorativo: ele ficaria
// verde mesmo se alguem apagasse a configuracao errada do `main.ts`.
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

class DtoComUmCampo {
  @IsOptional()
  @IsString()
  declarado?: string;
}

describe('VALIDATION_PIPE_OPTIONS — o que depende desta configuracao', () => {
  it('⚠️ whitelist REMOVE campo nao declarado no DTO', async () => {
    // Se esta opcao sumir, `?usuario[$ne]=` passa a chegar ao controller e o
    // gate por dono do card 11 cai junto.
    const out = await pipe.transform(
      { declarado: 'ok', INTRUSO: 'x' } as any,
      { type: 'query', metatype: DtoComUmCampo } as any,
    );

    expect(out.declarado).toBe('ok');
    expect(out).not.toHaveProperty('INTRUSO');
  });

  it('⚠️ transform faz o controller receber uma INSTANCIA, nao um objeto puro', async () => {
    const out = await pipe.transform(
      { declarado: 'ok' } as any,
      { type: 'query', metatype: DtoComUmCampo } as any,
    );

    expect(out).toBeInstanceOf(DtoComUmCampo);
  });

  it('⚠️ o clamp de limit do GetAllDtoInput chega ao controller', async () => {
    // MEDIDO: quem preserva o resultado do `@Transform` e o `whitelist`, nao o
    // `transform` — com `transform: false` e `whitelist: true` o clamp continua
    // valendo. Um pipe SEM NENHUMA opcao devolve `"999999"` cru, e era esse o
    // pipe duplicado que o `main.ts` registrava.
    const out = await pipe.transform(
      { limit: '999999' } as any,
      {
        type: 'query',
        metatype: GetAllDtoInput,
      } as any,
    );

    expect(out.limit).toBe(LIMITE_MAXIMO);
  });

  it('⚠️ um pipe SEM opcoes perde o clamp — o duplicado, se estivesse sozinho', async () => {
    // Registra a diferenca concreta entre as duas configuracoes, e portanto o
    // que se perderia se alguem apagasse a linha errada do `main.ts`.
    const cru = await new ValidationPipe().transform(
      { limit: '999999' } as any,
      {
        type: 'query',
        metatype: GetAllDtoInput,
      } as any,
    );

    expect(cru.limit).toBe('999999');
    expect(cru.limit).not.toBe(LIMITE_MAXIMO);
  });

  it('forbidNonWhitelisted continua FALSE — campo extra e descartado, nao recusado', async () => {
    // Deliberado: virar `true` transformaria em 400 toda chamada que hoje manda
    // um campo a mais, quebrando chamadores em silencio.
    await expect(
      pipe.transform(
        { declarado: 'ok', INTRUSO: 'x' } as any,
        {
          type: 'query',
          metatype: DtoComUmCampo,
        } as any,
      ),
    ).resolves.toBeDefined();
  });
});

describe('a segunda passada do pipe duplicado era no-op', () => {
  // ⚠️ Registra POR QUE foi seguro apagar o `new ValidationPipe()` que havia
  // no `main.ts`. `useGlobalPipes` acumula: os dois rodavam em sequencia, o
  // segundo recebendo a saida do primeiro. Se um dia alguem reintroduzir um
  // pipe global extra, ou escrever um `@Transform` nao idempotente, estes
  // testes sao o registro de qual propriedade se perdeu.
  const pipeCru = new ValidationPipe();

  const duasPassadas = async (entrada: any, metatype: any, type = 'query') => {
    const meta: any = { type, metatype };
    return pipeCru.transform(await pipe.transform(entrada, meta), meta);
  };

  const umaPassada = (entrada: any, metatype: any, type = 'query') =>
    pipe.transform(entrada, { type, metatype } as any);

  it('o clamp do limit e idempotente', async () => {
    const uma = await umaPassada({ limit: '999999' }, GetAllDtoInput);
    const duas = await duasPassadas({ limit: '999999' }, GetAllDtoInput);
    expect(duas.limit).toBe(uma.limit);
    expect(duas.limit).toBe(LIMITE_MAXIMO);
  });

  it('o gate de string do historico sobrevive as duas passadas', async () => {
    const uma = await umaPassada({ usuario: 'u1' }, ConsultarHistoricoDtoInput);
    const duas = await duasPassadas(
      { usuario: 'u1' },
      ConsultarHistoricoDtoInput,
    );
    expect(duas.usuario).toBe(uma.usuario);
  });
});
