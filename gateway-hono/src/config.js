export const config = {
  services: {
    auth: process.env.USUARIOS_SERVICE_URL || "http://usuarios:3001",
    gasolineras: process.env.GASOLINERAS_SERVICE_URL || "http://gasolineras:8000",
    evCharging: process.env.GASOLINERAS_SERVICE_URL || "http://gasolineras:8000",
  },
  port: process.env.PORT || 8080,
};
