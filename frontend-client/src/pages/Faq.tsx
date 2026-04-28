export default function Faq() {
  return (
    <div className="min-h-screen bg-linear-to-br from-[#F5F6FF] via-[#EEF0FF] to-[#E9ECFF] py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl border border-[#E7E9FB] shadow-sm p-6 md:p-8">
          <h1 className="text-3xl font-semibold text-[#0f172a] mb-2">FAQ</h1>
          <p className="text-sm text-gray-600 mb-6">Ultima actualizacion: 28 de abril de 2026</p>

          <section className="space-y-5 text-sm text-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">De donde salen los precios?</h2>
              <p>
                Los precios se obtienen de la fuente oficial del Ministerio y se actualizan de forma periodica.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Cada cuanto se actualizan los datos?</h2>
              <p>
                El servicio realiza sincronizaciones diarias. En momentos puntuales la fuente puede retrasarse y los
                datos tardar unas horas en reflejarse.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Como se calcula la cercania?</h2>
              <p>
                Usamos la posicion del dispositivo (si la autorizas) y calculos de distancia para ordenar y filtrar las
                estaciones mas cercanas.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Puedo eliminar mi cuenta?</h2>
              <p>
                Si. Desde tu perfil puedes solicitar la eliminacion de la cuenta. Tambien puedes escribir a
                soporte@tankgo.dev.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Por que no veo historial en algunas gasolineras?</h2>
              <p>
                El historial se genera cuando hay datos diarios disponibles. Algunas estaciones pueden no tener
                informacion completa en el periodo consultado.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
