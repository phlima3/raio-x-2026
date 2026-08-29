/**
 * `accountsUpdatedAt` é uma data sem hora, gravada como `Date.UTC(...)`
 * (meia-noite UTC). Formatar sem `timeZone: 'UTC'` deixa `toLocaleDateString`
 * usar o fuso do processo/navegador: em UTC-3 (Brasil) a meia-noite UTC do
 * dia X vira 21h do dia X-1 local, e a data exibida volta um dia. Fixar o
 * fuso em UTC também evita divergência de hidratação entre o SSG (roda em
 * UTC) e o navegador do usuário.
 */
export function formatAccountsDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
