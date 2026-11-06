# Potencia de antenas: referencias y parámetros estándar para el modelo

Consulta: 5 de noviembre de 2026. Objetivo: fijar los parámetros de "potencia de antena" solicitados en la retroalimentación del profesor, con fuentes verificadas, para usarlos como referencia al incorporar radios por candidato en el modelo (`feat/algoritmo`, fase 2). No es un estudio de propagación: el modelo sigue siendo geométrico (distancia + LOS sobre DEM), y la potencia entra como **radio efectivo por clase de antena**, no como cálculo de pérdidas.

## 1. Qué significa "potencia" en nuestro modelo

- El modelo actual (`simulacion/src/config.py`: `max_distance_m`, `antenna_height_m`, `receiver_height_m`) no modela pérdidas de propagación; esa limitación ya está declarada en los supuestos del proyecto.
- Por lo tanto, "potencia" se traduce en **radio de cobertura de referencia** por clase de estación: una clase de mayor PIRE justifica un radio mayor en la misma geometría LOS.
- Dos roles distintos que el modelo ya separa:
  - **Acceso** (antena → localidad): define `C(a)`, la cobertura de población.
  - **Enlace** (antena ↔ antena, hacia el gateway): define `G_conn`; exige LOS y usa la misma altura de antena en ambos extremos (`compute_connectivity`).

## 2. Clases de estación y potencias de referencia

| Clase | Potencia / límite verificado | Fuente |
| --- | --- | --- |
| Estación base macro rural (LTE/NR, clase *Wide Area BS*) | 3GPP **no fija techo**: la Tabla 6.2-1 de ETSI TS 136 104 deja "no upper limit" para Wide Area BS (escenario macro, acoplamiento mínimo 70 dB, §4.2). Sólo las clases menores están acotadas: Medium Range < +38 dBm, Local Area < +24 dBm, Home < +20 dBm. La cifra habitual de despliegue (~20 W = 43 dBm por puerto) es práctica de industria, no límite 3GPP | [1] ETSI TS 136 104 v15.13.0 |
| Estación fija TV White Spaces (TVWS), banda UHF de TV | FCC: potencia conducida ≤ 1 W (30 dBm); PIRE general ≤ 4 W (36 dBm); en zonas rurales "less congested" hasta **16 W EIRP (42 dBm)** desde 2020 (antes 10 W); altura ≤ 100 m sobre suelo y ≤ 500 m HAAT. La FCC justifica la banda por su propagación "over long distances, varying terrain" | [2] 47 CFR §15.709; [3] FCC ET Docket 20-36 |
| Wi-Fi / equipos de alcance reducido (Chile, no licenciada) | Subtel Res. 1985/2017 (refundido): **1 W de potencia máxima radiada** en 2.400–2.483,5 MHz y 5.250–5.850 MHz (outdoor, espectro ensanchado) | [4] Subtel Res. 1985/2017 |
| Enlace punto-a-punto de backhaul (microwave, antenas direccionales) | Estudio abierto de backhaul 6G: **10–100 mW** bastan para enlaces de 10–20 km con QPSK/64QAM usando antenas direccionales; la directividad, no la potencia, es el recurso dominante en PTP | [5] Frontiers in Communications and Networks (2021) |

Lectura para el proyecto: los tres órdenes de magnitud de PIRE de acceso (42 dBm TVWS/macro vs 30 dBm Wi-Fi) son exactamente el tipo de heterogeneidad que justifica clases con radios distintos por candidato.

## 3. Radios de celda rurales de referencia

| Indicador | Valor | Fuente |
| --- | --- | --- |
| ITU IMT-2020, test rural *Low Mobility Large Cell* (LMLC) | Distancia intersitio **≥ 6 km**; introducido por India como caso obligatorio IMT-2020; las villas rurales típicas distan 2–3 km entre sí y celdas de ~1 km de radio no alcanzan a conectar siquiera el 10 % | [6] J. IISc 100(2):399–408, 2020 |
| 700 MHz LTE, radio máximo citado por fabricante | **~8,5 km** (ZTE), con advertencia de QoS insatisfactoria en el borde | [7] Policytracker (white paper) |
| 700 MHz LTE, rango de celda por escenario (COST-Hata-231) | Rural ≈ **16,3 km** a 700 MHz vs ≈ **6,9 km** a 2.600 MHz; 95 % de fiabilidad con requerimiento indoor profundo reduce el radio a ~1,5 km (pérdida media 124 dB) | [8] J. Communications 15(7), 2020; [7] |
| Razonamiento FCC para TVWS rural | UHF TV "excellent propagation … over long distances, varying terrain and into and within buildings" | [3] |

Comprobación de orden de magnitud (cálculo propio, ilustrativo, espacio libre FSPL = 32,45 + 20·log₁₀(f[MHz]) + 20·log₁₀(d[km])):

| Escenario | Pérdida a 30 km |
| --- | --- |
| UHF TVWS ~470 MHz | ≈ 115,4 dB |
| 700 MHz | ≈ 118,9 dB |
| 2.600 MHz | ≈ 130,3 dB |

Un presupuesto típico de macro rural (PIRE ≈ 58–61 dBm con ganancia sectorial 15–18 dBi sobre 43 dBm por puerto) admite pérdidas de enlace del orden de 150+ dB en el enlace descendente, de modo que **30 km es plausible como techo de radio para la clase de baja banda / TVWS en terreno con LOS**, y marginal para 2,6–3,5 GHz. Este es el respaldo del `max_distance_m = 30 km` actual y del techo de 30 km que usa `G_conn`.

## 4. Marco normativo chileno (instalación, no radiación)

- **Ley 20.599** (2012) regula la instalación de antenas; en el LGUC los arts. **116 bis F y G** sujetan a permiso de recepción municipal toda torre soporte **mayor a 12 m** — la torre de 30 m del modelo cae en este régimen. Esto refuerza la posición ya documentada: el filtro PRC es *screening* territorial, no autorización de construcción. [9] BCN; [10] LGUC 116 bis F; [11] MINVU DDU 252.
- **Precedente nacional TVWS**: piloto SUBTEL + Compromiso País + Microsoft (Airband) en La Araucanía (2021) para conectividad rural; informe de compatibilidad con TVD de la U. de Chile presentado a SUBTEL; cobertura de prensa del primer piloto formal. [12][13][14] — precedente directo del tipo de red que nuestro modelo abstra (acceso rural + backhaul por LOS hacia un punto de presencia).

## 5. Implicancias de diseño para el repositorio

1. **Fase 2 (modelo)**: clases de antena con radio propio, p. ej. `macro-baja-banda` (referencia LTE 700 / TVWS, radio hasta 30 km), `wisp-tvws` (PIRE 42 dBm, radio ~10–15 km), `wifi-5,8` (1 W PIRE, radio ~3–8 km). Los valores finos quedan a la configuración del experimento; estas referencias justifican los órdenes de magnitud.
2. **Regla de enlace** `G_conn`: distancia ≤ mínimo de los radios de ambos extremos (un enlace necesita que ambas antenas alcancen la distancia).
3. **Documentación**: la "potencia" se declara como clase → radio de referencia; ninguna teoría de propagación nueva entra al código, consistente con los supuestos y límites (§4.3 de la propuesta) y con el comentario del profesor de que lo exhaustivo es sólo la construcción del grafo de visibilidad.

## Referencias

Acceso: 5 de noviembre de 2026. Todas las citas numéricas fueron verificadas contra el texto de la fuente (extracto PDF/HTML), salvo las marcadas como cálculo propio.

1. ETSI. *TS 136 104 V15.13.0 (3GPP TS 36.104 Rel-15) — LTE; Base Station (BS) radio transmission and reception*. Tabla 6.2-1 (potencia nominal por clase; nota "no upper limit" para Wide Area BS) y §4.2 (clases de BS). <https://www.etsi.org/deliver/etsi_ts/136100_136199/136104/15.13.00_60/ts_136104v151300p.pdf>
2. Código de Regulaciones Federales de EE. UU. *47 CFR § 15.709 — General technical requirements* (Subparte H, White Space Devices). <https://www.ecfr.gov/current/title-47/section-15.709>
3. FCC. *Fact Sheet: Unlicensed White Space Device Operations in the Television Bands*, ET Docket No. 20-36 (2020): 16 W EIRP en zonas "less congested", HAAT 500 m, altura 100 m. <https://docs.fcc.gov/public/attachments/doc-367358a1.pdf>
4. SUBTEL (Chile). *Resolución Exenta N.º 1985 de 2017, refundido 2019 — Norma Técnica de Equipos de Alcance Reducido*: 1 W radiado en 2,4 y 5,25–5,85 GHz. <https://www.subtel.gob.cl/wp-content/uploads/2019/10/Refundido_Res_1985_de_2017_2_855_2019.pdf>
5. *Wireless Terrestrial Backhaul for 6G Remote Access: Challenges and Low Power Solutions*. Frontiers in Communications and Networks, 2021. <https://www.frontiersin.org/journals/communications-and-networks/articles/10.3389/frcmn.2021.710781/full>
6. B. R. Tamma, N. Himayat et al. *A Case for Large Cells for Affordable Rural Cellular Coverage*. Journal of the Indian Institute of Science 100(2):399–408, 2020 (configuración ITU LMLC, ISD ≥ 6 km; villas a 2–3 km). <https://journal.iisc.ac.in/index.php/iisc/article/view/4847>
7. Policytracker. *Costing mobile coverage obligations: UK 700 MHz case study* (radio máximo ~8,5 km ZTE; 1,5 km / 124 dB para 95 % de fiabilidad). <http://www.policytracker.com/wp-content/uploads/PT-Coverage-obligations-white-paper-complete.pdf>
8. H. M. T. Al-Hilfi, A. S. Daghal. *Effects of Varying LTE Link Budget Parameters on MAPL and Cell Range*. Journal of Communications 15(7), 2020 (rango rural ≈16,3 km a 700 MHz; ≈6,9 km a 2.600 MHz, COST-Hata-231). <https://www.jocm.us/uploadfile/2020/0612/20200612042034407.pdf>
9. Biblioteca del Congreso Nacional de Chile. *Antenas de Telefonía Móvil en Chile, regulación de su instalación (rural y urbano)*. <https://obtienearchivo.bcn.cl/obtienearchivo?id=repositorio%2F10221%2F35336%2F1%2FAntenas_chile_rural_y_urbano_BCN.pdf>
10. *Ley General de Urbanismo y Construcciones, Art. 116 bis F* (torres soporte > 12 m). <https://leyes-cl.com/aprueba_nueva_ley_general_de_urbanismo_y_construcciones/116_bis_f.htm>
11. MINVU. *Circular DDU 252 (instalación de antenas, Ley 20.599)*. <https://www.minvu.gob.cl/wp-content/uploads/2019/06/DDU-252.pdf>
12. News Center Microsoft Latinoamérica. *SUBTEL, Compromiso País y Microsoft anuncian proyecto piloto (Airband) en La Araucanía*, 9 de septiembre de 2021. <https://news.microsoft.com/es-xl/subtel-compromiso-pais-y-microsoft-anuncian-proyecto-piloto-para-llevar-conectividad-a-localidad-de-la-araucania>
13. SUBTEL. *Tecnología TV White Spaces es compatible con TVD: Universidad de Chile presenta informe de compatibilidad*. <https://www.subtel.gob.cl/tecnologia-tv-white-spaces-es-compatible-con-tvd-universidad-de-chile-presenta-informe-de-compatibilidad-a-subtel/>
14. DPL News. *Chile prueba tecnología TV White Spaces para conectar zonas remotas*. <https://dplnews.com/chile-prueba-tecnologia-tv-white-spaces-para-conectar-zonas-remotas>
