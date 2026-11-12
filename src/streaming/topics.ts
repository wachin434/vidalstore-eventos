// Nombres de los topics en un solo lugar. Los crea vidalstore-plataforma/kafka/topics.sh, nunca el codigo.
export const TOPICS = {
  compras: 'vidalstore.compras',
  actividad: 'vidalstore.actividad',
  // Compactado: conserva el ultimo mensaje de cada key (juegoId). Lo crea topics.sh con cleanup.policy=compact.
  catalogo: 'vidalstore.catalogo',
} as const;
