/**
 * Single monetary rounding rule of Travel Lite: round to cents, half away
 * from zero. Intermediate floating-point noise (e.g. 1.005 * 100 =
 * 100.49999999999999) is removed with toPrecision(15) before rounding, so
 * 1.005 rounds to 1.01 as a human would expect.
 *
 * Use this for every monetary result stored, compared or returned; do not
 * inline Math.round(x * 100) / 100.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('roundMoney requires a finite number');
  const cents = Number((Math.abs(value) * 100).toPrecision(15));
  return (Math.sign(value) * Math.round(cents)) / 100 || 0;
}
