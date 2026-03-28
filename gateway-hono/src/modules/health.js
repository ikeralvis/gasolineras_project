async function probeServiceHealth(serviceConfig, healthTimeoutMs) {
  const healthCandidates = serviceConfig.healthPaths || ["/health", "/"];
  let lastError = null;

  try {
    for (const healthPath of healthCandidates) {
      const healthRes = await fetch(`${serviceConfig.url}${healthPath}`, {
        signal: AbortSignal.timeout(healthTimeoutMs),
      });

      if (healthRes.ok) {
        return {
          status: "UP",
          url: serviceConfig.url,
          healthPath,
        };
      }

      lastError = `HTTP ${healthRes.status} en ${healthPath}`;
    }

    return {
      status: "DOWN",
      url: serviceConfig.url,
      error: lastError,
    };
  } catch (error) {
    return {
      status: "DOWN",
      url: serviceConfig.url,
      error: error?.message || "Health probe failed",
    };
  }
}

function serviceWithoutUrlStatus(serviceConfig) {
  return {
    status: serviceConfig.optional ? "NOT_CONFIGURED" : "DOWN",
    url: null,
  };
}

function computeGatewayStatus(serviceRegistry, services) {
  const requiredServices = Object.entries(serviceRegistry).filter(([, service]) => !service.optional);
  const allRequiredServicesUp = requiredServices.every(([name]) => services[name]?.status === "UP");
  return {
    status: allRequiredServicesUp ? "UP" : "DEGRADED",
    httpStatus: allRequiredServicesUp ? 200 : 503,
  };
}

export function registerHealthRoute(app, { serviceRegistry, healthTimeoutMs }) {
  app.get("/health", async (c) => {
    const services = {};

    for (const [serviceName, serviceConfig] of Object.entries(serviceRegistry)) {
      if (!serviceConfig.url) {
        services[serviceName] = serviceWithoutUrlStatus(serviceConfig);
        continue;
      }

      services[serviceName] = await probeServiceHealth(serviceConfig, healthTimeoutMs);
    }

    const gateway = computeGatewayStatus(serviceRegistry, services);
    return c.json(
      {
        status: gateway.status,
        timestamp: new Date().toISOString(),
        services,
      },
      gateway.httpStatus
    );
  });
}
