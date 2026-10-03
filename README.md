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
  - **Oficial Semot 2026 (vigente desde el 23/09/2026)**: Banderazo de \$45.00 (cubre primeros 4.0 km) + \$4.00 por km adicional + \$1.00 por minuto detenido. Tarifa publicada por la Secretaría de Movilidad y Transporte de Hidalgo para Pachuca de Soto y Mineral de la Reforma.
  - **Tarifa anterior (antes de sept. 2026)**: Banderazo de \$38.00 (cubre primeros 4.0 km) + \$3.00 por km adicional + \$1.00 por minuto detenido.
  - **Tarifa Personalizada**: Ajustable libremente para otros municipios de Hidalgo (Mineral de la Reforma, Tulancingo, Tula, etc.).
- 🔋 **Función Screen Wake Lock**: Mantiene la pantalla encendida automáticamente mientras el taxímetro está en marcha para que el celular no se bloquee.
- 📡 **GPS con Filtro Anti-Ruido**: Algoritmo de distancia Haversine con descarte de falsos saltos satelitales y detección automática de velocidad/paradas.
- 🎮 **Modo Simulación de Prueba**: Permite simular un viaje en Pachuca (Centro Histórico / Reloj Monumental hasta Plaza Galerías) para probar la app desde cualquier computadora o casa.
- 🧾 **Comprobante / Ticket Digital**: Genera un resumen imprimible o compartible con 1 toque a WhatsApp.
- 🛡️ **Botón SOS / Compartir Ubicación**: Permite enviar tu ubicación y estado del viaje en tiempo real a familiares por WhatsApp.
- 📴 **100% Offline (PWA)**: Funciona sin consumir datos ni depender de la señal celular mediante Service Workers.

---

## 🧮 Detalle del Código: ¿Dónde y cómo se calcula el costo?

El cálculo del costo total se encuentra implementado en el archivo [`app.js`](app.js) dentro de la función **`calculateFare()`**, ahora en [`shared/fare.js`](shared/fare.js) y compartida por la app del pasajero y la del conductor (`app.js` solo la envuelve pasando el recargo nocturno).

### 📄 Código Fuente de la Función

```javascript
function calculateFare(distanceKm, waitSeconds, tariff, isNight) {
  const baseFare = Number(tariff.baseFare) || 45.00;
  const baseKm = Number(tariff.baseKm) || 4.0;
  const pricePerKm = Number(tariff.pricePerKm) || 4.00;
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
- Si el viaje mide **6.50 km**, los primeros 4.0 km quedan cubiertos y solo se cobran $2.50\text{ km} \times \$4.00 = \$10.00$.

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

## 🧑‍✈️ App del Conductor y Sincronización

- **Conductor**: `/conductor/` (misma URL de GitHub Pages + `conductor/`). Recibe en vivo distancia, tiempo, espera y tarifa del pasajero, **recalcula** el total con el mismo motor y avisa si difiere más de $0.01.
- **Sincronización P2P (WebRTC)**: sin servidor. En la app del pasajero toca 🔗 → genera el QR de invitación → el conductor lo escanea (o pega el código) → el pasajero escanea el QR de respuesta. Ambos ven un **código de 4 dígitos** que debe coincidir. Cada mensaje lleva número de secuencia y **HMAC-SHA-256** derivado de los códigos intercambiados; los inválidos o repetidos se descartan. Usa STUN público de Google; en redes que bloquean P2P puede fallar.
- **Sincronización obligatoria**: el pasajero no puede iniciar un viaje (ni la simulación) hasta estar sincronizado con el conductor; un aviso en la pantalla principal indica el estado. El emparejamiento se puede iniciar desde cualquiera de los dos lados (quien genera la invitación la muestra y el otro la escanea). Al conectar, el pasajero vuelve solo a la pantalla principal.
- **Sincronización solo por QR**: sin WebRTC ni red. Cada lado genera un QR corto (~110 caracteres) con una llave pública ECDH P-256 y el otro lo escanea; ambos derivan la misma clave HMAC (se guarda en el dispositivo) y ven un código de 4 dígitos para comparar. Con eso el pasajero puede iniciar viajes y, al terminar, el resumen del viaje va **firmado** y el conductor verifica la firma. Se intercambia también el hash de la app para detectar versiones distintas.
- **Diagnóstico**: si la conexión en vivo no se logra, la ventana muestra rutas locales/públicas, estado ICE y sugiere la misma Wi-Fi o la sincronización por QR. Los códigos de emparejamiento usan un SDP compacto (TP2) para que el QR sea más corto.
- **Plan B sin conexión**: si el emparejamiento falla (p. ej. redes distintas, tras 25 s la app lo avisa), el pasajero genera en 🔗 un código/QR del viaje con checksum SHA-256 y el conductor lo escanea o pega; el conductor recalcula el total. No autentica al emisor (no hay clave compartida), solo detecta daños y alteraciones del código.
- **Verificación de integridad**: `integrity.json` guarda el SHA-256 de cada archivo y un hash raíz. Al abrir, cada app descarga sus archivos, los hashea y muestra ✅/⚠️ en la cabecera; al emparejarse intercambian el hash raíz y, si difiere, no se envían datos hasta confirmar.
- **Tras editar cualquier archivo**: `node tools/build-manifest.mjs` y sube también `integrity.json`.
- **Limitación**: una app que se verifica a sí misma no protege si el servidor sirve código malicioso desde el inicio. Compara el hash raíz publicado aquí con el que muestra la insignia (pasa el cursor sobre ella).

---

## 📜 Fuente de las tarifas y notas

Tarifa oficial según el acuerdo publicado el 22/09/2026 en el Periódico Oficial del Estado de Hidalgo (primera fase, Pachuca y Mineral de la Reforma, +20 %): banderazo \$45 por los primeros 4 km y \$4 por km adicional. La norma indica que el taxímetro suma \$1 al avanzar 150 m en 60 s o al circular a menos de 15 km/h; **esta app cobra \$1 por minuto completo detenido** (velocidad casi nula) como aproximación auditable y no aplica recargo nocturno por defecto, ya que no se encontró una cifra oficial (es opcional en la configuración). Revisa el texto oficial para confirmar la regla exacta de espera.

---

## 🚀 Despliegue en GitHub Pages

1. Sube los archivos a la rama `main` de tu repositorio `TaximetroPachuca`.
2. En GitHub, ve a **Settings > Pages**.
3. En **Branch**, selecciona `main` y la carpeta `/ (root)`.
4. ¡Listo! Tu taxímetro estará disponible en `https://jamiltonbeach7-coder.github.io/TaximetroPachuca/`.

---

## 🤝 Contribuciones Comunitarias

Este es un proyecto libre bajo licencia MIT. Las propuestas de actualización de tarifas oficiales publicadas por el Periódico Oficial del Estado de Hidalgo (POEH) o acuerdos gremiales son bienvenidas mediante *Pull Requests* o *Issues*.

