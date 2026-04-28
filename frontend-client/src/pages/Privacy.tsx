export default function Privacy() {
  return (
    <div className="min-h-screen bg-linear-to-br from-[#F5F6FF] via-[#EEF0FF] to-[#E9ECFF] py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl border border-[#E7E9FB] shadow-sm p-6 md:p-8">
          <h1 className="text-3xl font-semibold text-[#0f172a] mb-2">Politica de privacidad</h1>
          <p className="text-sm text-gray-600 mb-6">Ultima actualizacion: 28 de abril de 2026</p>

          <section className="space-y-4 text-sm text-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Datos que recopilamos</h2>
              <p>
                Recopilamos datos de cuenta (correo, nombre) cuando el usuario se registra, asi como datos tecnicos
                anonimos para mejorar el rendimiento (por ejemplo, informacion de navegacion).
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Finalidad</h2>
              <p>
                Usamos los datos para ofrecer el servicio, personalizar la experiencia (como el combustible favorito) y
                mejorar la calidad de la plataforma. No vendemos datos a terceros.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Base legal</h2>
              <p>
                El tratamiento se basa en el consentimiento del usuario y en la ejecucion del servicio solicitado.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Conservacion</h2>
              <p>
                Conservamos los datos mientras la cuenta este activa. Puedes solicitar la eliminacion en cualquier
                momento.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Derechos del usuario</h2>
              <p>
                Puedes ejercer derechos de acceso, rectificacion, supresion, limitacion y portabilidad escribiendo a
                soporte@tankgo.dev.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Seguridad</h2>
              <p>
                Aplicamos medidas tecnicas y organizativas para proteger la informacion frente a accesos no autorizados.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
