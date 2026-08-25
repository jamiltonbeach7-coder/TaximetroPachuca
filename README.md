# 🚕 Taxímetro Pachuca - Código Abierto y Auditable

Una Aplicación Web Progresiva (PWA) de código abierto, accesible, ultra-intuitiva y auditable para el cálculo transparente de tarifas de taxi en **Pachuca de Soto** y la zona metropolitana del Estado de Hidalgo.

🌐 **Demo en vivo / GitHub Pages**: [https://jamiltonbeach7-coder.github.io/TaximetroPachuca/](https://jamiltonbeach7-coder.github.io/TaximetroPachuca/)

---

## 🎯 ¿Por qué este proyecto?

En Pachuca, la ausencia de una regulación generalizada de taxímetros ha generado incertidumbre y abusos en los cobros. Este proyecto surge como una **herramienta ciudadana y comunitaria** para que cualquier pasajero o conductor pueda:
1. Conocer exactamente cuánto debe costar un viaje con fórmulas matemáticas verificables.
2. Evitar discusiones antes o después del abordaje.
3. Usar una app limpia, sin publicidad, rápida y que no requiera conocimientos técnicos ni instalaciones complejas de tiendas de aplicaciones.

---

## ✨ Características Principales

- 📱 **Diseño Accesible (Cero Fricción)**: Números gigantes tipo LED/OLED, botones de alto contraste (Iniciar / Pausar / Terminar) y estados en lenguaje natural.
- 🔍 **Auditoría Matemática en Tiempo Real**: Muestra el desglose exacto de cada peso cobrado (Banderazo inicial + Distancia extra + Minutos de espera en semáforos/tráfico).
- 🏷️ **Perfiles de Tarifas Transparentes**:
  - **Pachuca 2026 (Propuesta gremio FUTVEH / SEMOT)**: Banderazo de \$50.00 (cubre primeros 4.0 km) + \$4.50 por km adicional + \$1.00 por minuto detenido.
  - **Referencia Histórica (Taxi Contigo)**: Banderazo de \$38.50 (cubre primeros 4.0 km) + \$3.50 por km adicional + \$1.00 por minuto detenido.
  - **Tarifa Personalizada**: Ajustable libremente para otros municipios de Hidalgo (Mineral de la Reforma, Tulancingo, Tula, etc.).
- 🔋 **Función Screen Wake Lock**: Mantiene la pantalla encendida automáticamente mientras el taxímetro está en marcha para que el celular no se bloquee.
- 📡 **GPS con Filtro Anti-Ruido**: Algoritmo de distancia Haversine con descarte de falsos saltos satelitales y detección automática de velocidad/paradas.
- 🎮 **Modo Simulación de Prueba**: Permite simular un viaje en Pachuca (Centro Histórico / Reloj Monumental hasta Plaza Galerías) para probar la app desde cualquier computadora o casa.
- 🧾 **Comprobante / Ticket Digital**: Genera un resumen imprimible o compartible con 1 toque a WhatsApp.
- 🛡️ **Botón SOS / Compartir Ubicación**: Permite enviar tu ubicación y estado del viaje en tiempo real a familiares por WhatsApp.
- 📴 **100% Offline (PWA)**: Funciona sin consumir datos ni depender de la señal celular mediante Service Workers.

---

## 🧮 Detalle del Código: ¿Dónde y cómo se calcula el costo?

El cálculo del costo total se encuentra implementado en el archivo [`app.js`](app.js) dentro de la función **`calculateFare()`** (Líneas 307 a 346).

### 📄 Código Fuente de la Función

```javascript
function calculateFare(distanceKm, waitSeconds, tariff, isNight) {
  const baseFare = Number(tariff.baseFare) || 50.00;
  const baseKm = Number(tariff.baseKm) || 4.0;
  const pricePerKm = Number(tariff.pricePerKm) || 4.50;
  const pricePerWaitMin = Number(tariff.pricePerWaitMinute) || 1.00;

  // 1. Kilómetros adicionales que exceden el banderazo
  const extraKm = Math.max(0, distanceKm - baseKm);
  const extraDistFare = extraKm * pricePerKm;

  // 2. Minutos de espera en semáforos o tráfico detenido
  const waitMinutes = Math.floor(waitSeconds / 60);
  const extraWaitFare = waitMinutes * pricePerWaitMin;

  // 3. Subtotal diurno
  const subtotal = baseFare + extraDistFare + extraWaitFare;

  // 4. Recargo nocturno (si aplica)
  let nightFare = 0;
  if (isNight) {
    nightFare = subtotal * (state.nightSurchargePct / 100);
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
    total: Math.max(baseFare, total) // Garantiza nunca cobrar menos del banderazo base
  };
}
```

---

### 🔍 Explicación Paso a Paso del Algoritmo

| Parámetro | Tipo | Descripción |
| :--- | :--- | :--- |
| `distanceKm` | `Number` | Distancia total recorrida acumulada (en kilómetros), calculada por GPS mediante la fórmula esférica de Haversine con filtro anti-ruido ($\ge 8\text{ m}$). |
| `waitSeconds` | `Number` | Segundos acumulados con el vehículo detenido o en avance lento ($< 3.5\text{ km/h}$) en semáforos, intersecciones y embotellamientos. |
| `tariff` | `Object` | Configuración de precios activa (ej. Banderazo inicial, distancia base incluida, costo por km extra y costo por minuto de espera). |
| `isNight` | `Boolean` | Indicador de tarifa nocturna (activa automáticamente o manual entre las 22:00 y las 05:00 hrs). |

#### 1. Distancia Extra sobre el Banderazo
$$\text{extraKm} = \max(0, \text{distanceKm} - \text{baseKm})$$
- Si el viaje dura **menos de 4.0 km**, la distancia extra es $0.00\text{ km}$ y no se cobra ningún peso adicional sobre el banderazo.
- Si el viaje mide **6.50 km**, los primeros 4.0 km quedan cubiertos y solo se cobran $2.50\text{ km} \times \$4.50 = \$11.25$.

#### 2. Tiempo de Espera en Tráfico y Semáforos
$$\text{waitMinutes} = \lfloor \text{waitSeconds} / 60 \rfloor$$
- Solo se cobran **minutos enteros completados** a razón de $\$1.00\text{ MXN/min}$. Los segundos fraccionarios no se cobran hasta completar el minuto siguiente.

#### 3. Subtotal Base
$$\text{Subtotal} = \text{Banderazo Base} + (\text{extraKm} \times \text{Precio por Km}) + (\text{waitMinutes} \times \text{Precio por Min})$$

#### 4. Recargo Nocturno (Opcional)
- Si la tarifa nocturna está activa, se suma un **20%** sobre el subtotal acumulado.

#### 5. Total Final Auditado
- Se aplica `Math.max(baseFare, total)` para asegurar que bajo ninguna circunstancia matemática el cobro sea inferior al banderazo regulado de arranque.

---

## 🚀 Despliegue en GitHub Pages

1. Sube los archivos a la rama `main` de tu repositorio `TaximetroPachuca`.
2. En GitHub, ve a **Settings > Pages**.
3. En **Branch**, selecciona `main` y la carpeta `/ (root)`.
4. ¡Listo! Tu taxímetro estará disponible en `https://jamiltonbeach7-coder.github.io/TaximetroPachuca/`.

---

## 🤝 Contribuciones Comunitarias

Este es un proyecto libre bajo licencia MIT. Las propuestas de actualización de tarifas oficiales publicadas por el Periódico Oficial del Estado de Hidalgo (POEH) o acuerdos gremiales son bienvenidas mediante *Pull Requests* o *Issues*.

