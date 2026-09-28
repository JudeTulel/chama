export function normalizeChamaName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Please enter a name for your chama.');
  if (new TextEncoder().encode(name).length > 64) throw new Error('Chama names must be 64 UTF-8 bytes or fewer.');
  return name;
}
