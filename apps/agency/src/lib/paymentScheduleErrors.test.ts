import { describe, expect, it } from 'vitest';
import { translateApiErrorMessage } from './errorTranslation';

describe('erros de pagamento', () => {
  it.each([
    ['Payment exceeds sale balance', 'A baixa excede o saldo da venda.'],
    ['Partial payments are not allowed', 'Esta condição não permite baixa parcial de uma parcela.'],
    ['Payment condition is not applicable to every sale item', 'A condição não se aplica a todos os itens da venda.'],
    ['Existing receivables require explicit reconciliation', 'Os recebíveis existentes exigem conciliação antes de aplicar o cronograma.'],
    ['Idempotency key was already used with a different payload', 'Esta tentativa de baixa já foi usada com outros dados. Atualize o saldo antes de continuar.'],
  ])('traduz %s', (message, translated) => {
    expect(translateApiErrorMessage(message)).toBe(translated);
  });
});
