export default function Legal() {
  return (
    <div className="min-h-screen bg-linear-to-br from-[#F5F6FF] via-[#EEF0FF] to-[#E9ECFF] py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl border border-[#E7E9FB] shadow-sm p-6 md:p-8">
          <h1 className="text-3xl font-semibold text-[#0f172a] mb-2">Aviso legal</h1>
          <p className="text-sm text-gray-600 mb-6">Ultima actualizacion: 28 de abril de 2026</p>

          <section className="space-y-4 text-sm text-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Titularidad</h2>
              <p>
                TankGo es una plataforma informativa para la consulta de precios de carburantes. El titular del sitio es
                TankGo Labs, con domicilio en Espana. Para cualquier consulta puedes escribir a soporte@tankgo.dev.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Objeto</h2>
              <p>
                El presente aviso regula el acceso y uso de la web y la app TankGo. El usuario acepta las condiciones
                desde el momento en que navega o utiliza los servicios disponibles.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Propiedad intelectual</h2>
              <p>
                Los contenidos, marcas, logotipos y elementos visuales son propiedad de sus respectivos titulares. Queda
                prohibida su reproduccion total o parcial sin autorizacion expresa.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Responsabilidad</h2>
              <p>
                TankGo ofrece informacion basada en fuentes oficiales. No garantiza la disponibilidad continua del
                servicio ni la ausencia de errores. El usuario entiende que los precios pueden variar y estan sujetos a
                actualizaciones periodicas.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Enlaces externos</h2>
              <p>
                Este sitio puede contener enlaces a terceros. TankGo no se responsabiliza del contenido ni de las
                politicas de esos sitios externos.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Legislacion aplicable</h2>
              <p>
                La relacion entre TankGo y el usuario se regira por la legislacion espanola. Para cualquier conflicto,
                las partes se someten a los juzgados y tribunales competentes.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
