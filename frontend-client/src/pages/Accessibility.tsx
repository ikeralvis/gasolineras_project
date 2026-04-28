export default function Accessibility() {
  return (
    <div className="min-h-screen bg-linear-to-br from-[#F5F6FF] via-[#EEF0FF] to-[#E9ECFF] py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl border border-[#E7E9FB] shadow-sm p-6 md:p-8">
          <h1 className="text-3xl font-semibold text-[#0f172a] mb-2">Accesibilidad</h1>
          <p className="text-sm text-gray-600 mb-6">Ultima actualizacion: 28 de abril de 2026</p>

          <section className="space-y-4 text-sm text-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Compromiso</h2>
              <p>
                TankGo trabaja para que sus contenidos sean accesibles para todas las personas, cumpliendo con las
                directrices WCAG 2.1 AA en la medida de lo posible.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Medidas adoptadas</h2>
              <p>
                Usamos contrastes adecuados, navegacion por teclado, estructura semantica y etiquetas accesibles en
                formularios y botones.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Limitaciones</h2>
              <p>
                Puede haber contenidos de terceros que no cumplan con el mismo nivel de accesibilidad. Si detectas un
                problema, por favor contacta con soporte@tankgo.dev.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Contacto</h2>
              <p>
                Puedes enviar sugerencias o incidencias de accesibilidad a soporte@tankgo.dev. Responderemos lo antes
                posible.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
