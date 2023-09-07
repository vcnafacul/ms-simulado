function toPascalCase(str: string) {
  return str
    .split(' ')
    .map(
      (word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase(),
    )
    .join('');
}

function removeAcentos(str: string) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function toPascalCaseSemAcentos(str: string) {
  const semAcentos = removeAcentos(str);
  return toPascalCase(semAcentos);
}
