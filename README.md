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

## 📐 Fórmula de Cálculo Auditable

```text
Distancia Extra (km) = Máximo(0, Distancia Total - Km Base Banderazo)
Costo Distancia Extra = Distancia Extra × Costo por Km

Minutos Detenido = Piso(Segundos con Velocidad < 4 km/h / 60)
Costo Espera = Minutos Detenido × Costo por Minuto

Subtotal = Banderazo Base + Costo Distancia Extra + Costo Espera

Total Final = Subtotal × (1 + Recargo Nocturno Si Aplica)
```

---

## 🚀 Despliegue en GitHub Pages

1. Sube los archivos a la rama `main` de tu repositorio `TaximetroPachuca`.
2. En GitHub, ve a **Settings > Pages**.
3. En **Branch**, selecciona `main` y la carpeta `/ (root)`.
4. ¡Listo! Tu taxímetro estará disponible en `https://jamiltonbeach7-coder.github.io/TaximetroPachuca/`.

---

## 🤝 Contribuciones Comunitarias

Este es un proyecto libre bajo licencia MIT. Las propuestas de actualización de tarifas oficiales publicadas por el Periódico Oficial del Estado de Hidalgo (POEH) o acuerdos gremiales son bienvenidas mediante *Pull Requests* o *Issues*.
