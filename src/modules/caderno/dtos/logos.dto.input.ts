import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LogosDoCaderno, temLogo } from '../logos';
import { ChaveDeLogo, NOMES_DOS_LOGOS } from '../templates';
import { extensaoDosBytes } from '../imagens/formato';

export class LogosDtoInput {
  @IsOptional()
  @IsString()
  vnf?: string | null;

  @IsOptional()
  @IsString()
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
 * ⚠️ **Esta função é a porta única de validação, de propósito.** Qualquer
 * defeito de logo — base64 malformado, bytes que não são imagem, chave
 * desconhecida — degrada silenciosamente a ausência. Uma requisição com logo
 * ruim NUNCA deve matar a geração da prova: ausência é estado normal e as
 * rotas GET/POST já advertem cada caso. Se recusássemos aqui, um cliente que
 * mandou base64 legível mas não-imagem teria sucesso, enquanto um que mandou
 * base64 malformado teria 400 — mesmo problema, dois resultados, confusa.
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
