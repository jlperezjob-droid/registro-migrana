// Pruebas de la lógica de límites. Ejecutar con:  TZ=Europe/Madrid node --test tests/logic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../logic.js');

const at = (m, d, h = 12, min = 0) => new Date(2026, m - 1, d, h, min).getTime(); // mes 1-12
let n = 0;
const dose = (medId, t) => ({ id: 'd' + (++n), medId, t, pain: null, note: '' });
const tript = (limit, extra = {}) => Object.assign({ id: 'trip', name: 'Triptán', limit, maxPer24h: null, minHours: null }, extra);

test('10 tomas en días distintos: límite alcanzado, vuelve 30 días después de la más antigua', () => {
  const med = tript({ count: 10, unit: 'tomas', window: 'movil' });
  const doses = []; for (let d = 1; d <= 10; d++) doses.push(dose('trip', at(11, d)));
  const st = R.computeStatus(med, doses, at(11, 23, 20));
  assert.equal(st.limit.used, 10);
  assert.equal(st.limit.remaining, 0);
  assert.equal(st.canTake, false);
  assert.equal(st.level, 'bloqueado');
  assert.equal(st.nextAt, new Date(2026, 11, 1).getTime()); // 1 dic 00:00
});

test('al llegar la fecha liberada ya puede tomar', () => {
  const med = tript({ count: 10, unit: 'tomas', window: 'movil' });
  const doses = []; for (let d = 1; d <= 10; d++) doses.push(dose('trip', at(11, d)));
  const st = R.computeStatus(med, doses, at(12, 1, 0, 1));
  assert.equal(st.canTake, true);
  assert.equal(st.limit.remaining, 1);
});

test('dos tomas el mismo día cuentan como 2 en modo tomas y como 1 en modo días', () => {
  const doses = [dose('trip', at(11, 5, 9)), dose('trip', at(11, 5, 15))];
  for (let d = 6; d <= 13; d++) doses.push(dose('trip', at(11, d)));
  const now = at(11, 23);
  const porTomas = R.computeStatus(tript({ count: 10, unit: 'tomas', window: 'movil' }), doses, now);
  assert.equal(porTomas.limit.used, 10);
  assert.equal(porTomas.canTake, false);
  assert.equal(porTomas.nextAt, new Date(2026, 11, 5).getTime());
  assert.equal(porTomas.limit.releaseCount, 2);
  const porDias = R.computeStatus(tript({ count: 10, unit: 'dias', window: 'movil' }), doses, now);
  assert.equal(porDias.limit.used, 9);
  assert.equal(porDias.limit.remaining, 1);
  assert.equal(porDias.canTake, true);
});

test('modo días: con el límite gastado puede repetir hoy si hoy ya contaba', () => {
  const med = tript({ count: 3, unit: 'dias', window: 'movil' });
  const doses = [dose('trip', at(11, 20)), dose('trip', at(11, 21)), dose('trip', at(11, 23, 8))];
  const hoy = R.computeStatus(med, doses, at(11, 23, 18));
  assert.equal(hoy.canTake, true);
  assert.equal(hoy.limit.todayCounted, true);
  assert.equal(hoy.limit.availableAt, new Date(2026, 11, 20).getTime()); // día nuevo: 20 nov + 30
  const manana = R.computeStatus(med, doses, at(11, 24, 10));
  assert.equal(manana.canTake, false);
  assert.equal(manana.nextAt, new Date(2026, 11, 20).getTime());
});

test('mes natural: las de octubre no cuentan y se reinicia el día 1', () => {
  const med = tript({ count: 3, unit: 'tomas', window: 'natural' });
  const doses = [dose('trip', at(10, 30)), dose('trip', at(10, 31)), dose('trip', at(11, 2)), dose('trip', at(11, 10)), dose('trip', at(11, 20))];
  const st = R.computeStatus(med, doses, at(11, 23));
  assert.equal(st.limit.used, 3);
  assert.equal(st.canTake, false);
  assert.equal(st.nextAt, new Date(2026, 11, 1).getTime());
});

test('por encima del límite: espera a que salgan las sobrantes', () => {
  const med = tript({ count: 10, unit: 'tomas', window: 'movil' });
  const doses = []; for (let d = 1; d <= 12; d++) doses.push(dose('trip', at(11, d)));
  const st = R.computeStatus(med, doses, at(11, 23));
  assert.equal(st.limit.over, 2);
  assert.equal(st.nextAt, new Date(2026, 11, 3).getTime()); // la 3.ª más antigua (3 nov) + 30
});

test('máximo en 24 h', () => {
  const med = tript(null, { maxPer24h: 2 });
  const now = at(11, 23, 20);
  const doses = [dose('trip', now - 5 * R.HOUR), dose('trip', now - 1 * R.HOUR)];
  const st = R.computeStatus(med, doses, now);
  assert.equal(st.canTake, false);
  assert.equal(st.level, 'espera');
  assert.equal(st.nextAt, now - 5 * R.HOUR + R.DAY);
});

test('horas mínimas entre tomas', () => {
  const med = tript(null, { minHours: 2 });
  const now = at(11, 23, 20);
  const st = R.computeStatus(med, [dose('trip', now - R.HOUR)], now);
  assert.equal(st.canTake, false);
  assert.equal(st.nextAt, now + R.HOUR);
  const later = R.computeStatus(med, [dose('trip', now - 3 * R.HOUR)], now);
  assert.equal(later.canTake, true);
});

test('se combinan restricciones: manda la más tardía', () => {
  const med = tript({ count: 2, unit: 'tomas', window: 'movil' }, { minHours: 2 });
  const now = at(11, 23, 20);
  const st = R.computeStatus(med, [dose('trip', at(11, 1)), dose('trip', now - R.HOUR)], now);
  assert.equal(st.blocks.length, 2);
  assert.equal(st.nextAt, new Date(2026, 11, 1).getTime());
  assert.equal(st.level, 'bloqueado');
});

test('aviso de "quedan pocas" con el 20 % o menos', () => {
  const med = tript({ count: 10, unit: 'tomas', window: 'movil' });
  const doses = []; for (let d = 1; d <= 8; d++) doses.push(dose('trip', at(11, d)));
  assert.equal(R.computeStatus(med, doses, at(11, 23)).level, 'pocas');
  assert.equal(R.computeStatus(med, doses.slice(0, 7), at(11, 23)).level, 'ok');
});

test('las tomas de otros medicamentos y las futuras no cuentan', () => {
  const med = tript({ count: 2, unit: 'tomas', window: 'movil' });
  const doses = [dose('otro', at(11, 20)), dose('otro', at(11, 21)), dose('trip', at(11, 24))];
  const st = R.computeStatus(med, doses, at(11, 23));
  assert.equal(st.limit.used, 0);
  assert.equal(st.canTake, true);
});

test('ventana de 30 días que cruza el cambio de hora (25 oct)', () => {
  const med = tript({ count: 1, unit: 'tomas', window: 'movil' });
  const st = R.computeStatus(med, [dose('trip', at(10, 20, 23, 30))], at(11, 1));
  assert.equal(st.canTake, false);
  assert.equal(st.nextAt, new Date(2026, 10, 19).getTime()); // 19 nov 00:00 hora local
  assert.equal(R.periodDays(med.limit, at(11, 1)).length, 30);
});

test('días con alguna medicación en los últimos 30 días', () => {
  const doses = [dose('a', at(11, 20, 9)), dose('b', at(11, 20, 18)), dose('a', at(11, 22)), dose('a', at(10, 1))];
  assert.equal(R.daysWithMedication(doses, at(11, 23)), 2);
});
