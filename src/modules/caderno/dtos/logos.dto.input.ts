import { IsBase64, IsOptional, IsString } from 'class-validator';
import { LogosDoCaderno, temLogo } from '../logos';
import { ChaveDeLogo, NOMES_DOS_LOGOS } from '../templates';

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

  // Base64 válido contém só A-Za-z0-9+/ (e opcionalmente = para padding)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

  for (const chave of Object.keys(NOMES_DOS_LOGOS) as ChaveDeLogo[]) {
    const valor = corpo[chave];
    if (typeof valor !== 'string' || valor.length === 0) continue;

    // Rejeitar strings que não têm o formato de base64
    if (!base64Regex.test(valor)) continue;

    // ⚠️ `Buffer.from` nunca lança em base64 inválido: ele descarta o que não
    // reconhece. Zero byte é o sinal de que não sobrou nada.
    const buffer = Buffer.from(valor, 'base64');
    if (temLogo(buffer)) logos[chave] = buffer;
  }

  return logos;
}
