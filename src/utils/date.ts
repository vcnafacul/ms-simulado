export const getDateNow = () => {
    const date = new Date();
    const formatted = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    });
    return formatted
}