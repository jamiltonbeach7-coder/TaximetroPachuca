/**
 * Taxímetro Pachuca - Motor de tarifas compartido (pasajero y conductor)
 * Una sola fuente de verdad: ambas apps calculan el costo con esta misma función.
 */
(function (root) {
  const TARIFF_PRESETS = {
    pachuca_2026: {
      name: "Oficial Semot 2026 ($45.00 base)",
      shortName: "Oficial 2026 ($45 base / 4km + $4/km)",
      baseFare: 45.00,
      baseKm: 4.0,
      pricePerKm: 4.00,
      pricePerWaitMinute: 1.00
    },
    historica: {
      name: "Tarifa anterior a sept. 2026 ($38.00 base)",
      shortName: "Anterior ($38 base / 4km + $3/km)",
      baseFare: 38.00,
      baseKm: 4.0,
      pricePerKm: 3.00,
      pricePerWaitMinute: 1.00
    },
    custom: {
      name: "Tarifa Personalizada",
      shortName: "Personalizada",
      baseFare: 45.00,
      baseKm: 4.0,
      pricePerKm: 4.00,
      pricePerWaitMinute: 1.00
    }
  };

  function calculateFare(distanceKm, waitSeconds, tariff, isNight, nightSurchargePct) {
    const nightPct = nightSurchargePct === undefined ? 20 : nightSurchargePct;
    const baseFare = Number(tariff.baseFare) || 45.00;
    const baseKm = Number(tariff.baseKm) || 4.0;
    const pricePerKm = Number(tariff.pricePerKm) || 4.00;
    const pricePerWaitMin = Number(tariff.pricePerWaitMinute) || 1.00;

    // Kilómetros adicionales que exceden el banderazo
    const extraKm = Math.max(0, distanceKm - baseKm);
    const extraDistFare = extraKm * pricePerKm;

    // Minutos de espera en semáforos o tráfico detenido
    const waitMinutes = Math.floor(waitSeconds / 60);
    const extraWaitFare = waitMinutes * pricePerWaitMin;

    // Subtotal diurno
    const subtotal = baseFare + extraDistFare + extraWaitFare;

    // Recargo nocturno (si aplica)
    let nightFare = 0;
    if (isNight) {
      nightFare = subtotal * (nightPct / 100);
    }

    const total = subtotal + nightFare;

    return {
      baseFare,
      baseKm,
      extraKm,
      pricePerKm,
      extraDistFare,
      waitMinutes,
      pricePerWaitMin,
      extraWaitFare,
      isNight,
      nightFare,
      subtotal,
      total: Math.max(baseFare, total)
    };
  }

  const TP = root.TP = root.TP || {};
  TP.TARIFF_PRESETS = TARIFF_PRESETS;
  TP.calculateFare = calculateFare;
})(window);
