/*
 * Lógica de cálculo de límites. Sin dependencias del DOM para poder probarla con Node.
 *
 * Modelo:
 *   med   = { id, name, color, limit: { count, unit: 'tomas'|'dias', window: 'movil'|'natural' } | null,
 *             maxPer24h: number|null, minHours: number|null, archived: bool }
 *   dose  = { id, medId, t: ms epoch, pain: 1..10|null, note: string }
 */
(function (root) {
  'use strict';

  var HOUR = 3600000;
  var DAY = 86400000;
  var WINDOW_DAYS = 30;

  function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ms, n) { var d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
  function startOfMonth(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
  function startOfNextMonth(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /** Inicio del periodo que cuenta para el límite (incluido). */
  function periodStart(limit, now) {
    if (limit && limit.window === 'natural') return startOfMonth(now);
    return startOfDay(addDays(now, -(WINDOW_DAYS - 1))); // últimos 30 días contando hoy
  }

  /** Días (inicio de día en ms) que forman el periodo, para dibujar la tira. */
  function periodDays(limit, now) {
    var out = [];
    var start = periodStart(limit, now);
    var end = (limit && limit.window === 'natural') ? addDays(startOfNextMonth(now), -1) : startOfDay(now);
    for (var d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }

  function uniqueDays(list) {
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var k = startOfDay(list[i].t);
      if (!seen[k]) { seen[k] = true; out.push(k); }
    }
    return out.sort(function (a, b) { return a - b; });
  }

  /**
   * Estado de un medicamento en el instante `now`.
   * Devuelve cuántas quedan, si puede tomar ya y, si no, desde cuándo.
   */
  function computeStatus(med, doses, now) {
    var mine = doses
      .filter(function (d) { return d.medId === med.id && d.t <= now; })
      .sort(function (a, b) { return a.t - b.t; });
    var last = mine.length ? mine[mine.length - 1] : null;
    var res = {
      medId: med.id,
      last: last,
      blocks: [],        // [{ type: 'limite'|'24h'|'intervalo', until: ms }]
      canTake: true,
      nextAt: null,      // ms desde el que puede volver a tomar (si está bloqueado)
      level: 'ok',       // 'ok' | 'pocas' | 'espera' | 'bloqueado'
      limit: null
    };

    var todayStart = startOfDay(now);

    if (med.limit && med.limit.count > 0) {
      var L = med.limit.count;
      var natural = med.limit.window === 'natural';
      var start = periodStart(med.limit, now);
      var inPeriod = mine.filter(function (d) { return d.t >= start; });
      var used, blocked, availableAt = null, nextRelease = null, releaseCount = 0, todayCounted = false;

      if (med.limit.unit === 'dias') {
        var days = uniqueDays(inPeriod);
        used = days.length;
        todayCounted = days.indexOf(todayStart) !== -1;
        // Si hoy ya cuenta como día de toma, otra toma hoy no gasta un día nuevo.
        blocked = used > L || (used >= L && !todayCounted);
        if (used >= L) availableAt = natural ? startOfNextMonth(now) : addDays(days[used - L], WINDOW_DAYS);
        if (used > 0) {
          nextRelease = natural ? startOfNextMonth(now) : addDays(days[0], WINDOW_DAYS);
          releaseCount = natural ? used : 1;
        }
      } else {
        used = inPeriod.length;
        blocked = used >= L;
        if (used >= L) availableAt = natural ? startOfNextMonth(now) : addDays(startOfDay(inPeriod[used - L].t), WINDOW_DAYS);
        if (used > 0) {
          var firstDay = startOfDay(inPeriod[0].t);
          nextRelease = natural ? startOfNextMonth(now) : addDays(firstDay, WINDOW_DAYS);
          releaseCount = natural ? used : inPeriod.filter(function (d) { return startOfDay(d.t) === firstDay; }).length;
        }
      }

      res.limit = {
        count: L,
        unit: med.limit.unit,
        window: med.limit.window,
        used: used,
        remaining: Math.max(0, L - used),
        over: Math.max(0, used - L),
        todayCounted: todayCounted,
        periodStart: start,
        nextRelease: nextRelease,   // cuándo se libera la más antigua (aunque no esté bloqueado)
        releaseCount: releaseCount, // cuántas se liberan ese día
        availableAt: availableAt    // cuándo podrá tomar en un día nuevo si se ha agotado
      };
      if (blocked) res.blocks.push({ type: 'limite', until: availableAt });
    }

    if (med.maxPer24h > 0) {
      var recent = mine.filter(function (d) { return d.t > now - DAY; });
      if (recent.length >= med.maxPer24h) {
        res.blocks.push({ type: '24h', until: recent[recent.length - med.maxPer24h].t + DAY });
      }
    }

    if (med.minHours > 0 && last) {
      var until = last.t + med.minHours * HOUR;
      if (until > now) res.blocks.push({ type: 'intervalo', until: until });
    }

    if (res.blocks.length) {
      res.canTake = false;
      res.nextAt = Math.max.apply(null, res.blocks.map(function (b) { return b.until; }));
      res.level = res.blocks.some(function (b) { return b.type === 'limite'; }) ? 'bloqueado' : 'espera';
    } else if (res.limit) {
      var warnAt = Math.max(1, Math.ceil(res.limit.count * 0.2));
      if (res.limit.remaining <= warnAt) res.level = 'pocas';
    }
    return res;
  }

  /** Recuento de tomas por día para una lista de días (para la tira y el calendario). */
  function countsByDay(doses, medId) {
    var out = {};
    doses.forEach(function (d) {
      if (medId && d.medId !== medId) return;
      var k = startOfDay(d.t);
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  /** Días distintos con cualquier medicación en los últimos 30 días (contando hoy). */
  function daysWithMedication(doses, now, medIds) {
    var start = startOfDay(addDays(now, -(WINDOW_DAYS - 1)));
    var list = doses.filter(function (d) {
      return d.t >= start && d.t <= now && (!medIds || medIds.indexOf(d.medId) !== -1);
    });
    return uniqueDays(list).length;
  }

  var api = {
    HOUR: HOUR, DAY: DAY, WINDOW_DAYS: WINDOW_DAYS,
    startOfDay: startOfDay, addDays: addDays, startOfMonth: startOfMonth, startOfNextMonth: startOfNextMonth,
    daysBetween: daysBetween, dayKey: dayKey, pad: pad,
    periodStart: periodStart, periodDays: periodDays,
    computeStatus: computeStatus, countsByDay: countsByDay, daysWithMedication: daysWithMedication
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RegMed = api;
})(this);
