export const config = {
  services: {
    auth: process.env.AUTH_SERVICE_URL || "http://auth-service:3001",
    gasolineras: process.env.GASOLINERAS_SERVICE_URL || "http://gasolineras-service:8000",
  },
  port: process.env.PORT || 8080,
};
