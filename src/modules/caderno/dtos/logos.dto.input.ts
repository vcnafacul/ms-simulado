import { IsBase64, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LogosDoCaderno, temLogo } from '../logos';
import { ChaveDeLogo, NOMES_DOS_LOGOS } from '../templates';
import { extensaoDosBytes } from '../imagens/formato';

export class LogosDtoInput {
  @IsOptional()
  @IsString()
  @IsBase64()
  vnf?: string | null;

  @IsOptional()
  @IsString()
  @IsBase64()
  cursinho?: string | null;
}

export class CadernoDtoInput {
  @IsOptional()
  @ValidateNested()
  @Type(() => LogosDtoInput)
  logos?: LogosDtoInput;
}

/**
 * Base64 → Buffer, chave a chave.
 *
 * ⚠️ **Base64 inválido vira ausência, não exceção.** Recusar a requisição
 * inteira por causa de um logo ilegível derrubaria a geração da prova — e o
 * caminho de ausência já existe e já avisa. O `@IsBase64` do DTO é que reporta
 * a malformação como 400 quando o `ValidationPipe` está ligado; isto aqui é a
 * rede embaixo.
 *
 * ⚠️ Só as chaves de `NOMES_DOS_LOGOS` atravessam. Um corpo com chave extra
 * não vira arquivo no zip.
 */
export function decodificarLogos(
  corpo: LogosDtoInput | undefined,
): LogosDoCaderno {
  const logos: LogosDoCaderno = {};
  if (!corpo) return logos;

  for (const chave of Object.keys(NOMES_DOS_LOGOS) as ChaveDeLogo[]) {
    const valor = corpo[chave];
    if (typeof valor !== 'string' || valor.length === 0) continue;

    // ⚠️ `Buffer.from` nunca lança em base64 inválido: descarta o que não
    // reconhece e FICA COM O RESTO. 'abc' vira 2 bytes; lixo acentuado vira 6.
    // Zero byte NÃO é sinal confiável de lixo — quem recusa é o
    // `extensaoDosBytes`, pelos magic bytes. O `temLogo` cobre só o vazio.
    const buffer = Buffer.from(valor, 'base64');
    if (temLogo(buffer) && extensaoDosBytes(buffer)) logos[chave] = buffer;
  }

  return logos;
}
