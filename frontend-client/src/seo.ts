type SeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  noIndex?: boolean;
};

const SITE_URL = "https://tankgo.dev";
const DEFAULT_TITLE = "TankGo - Encuentra el mejor precio";
const DEFAULT_DESCRIPTION =
  "Encuentra las gasolineras mas baratas de Espana. Compara precios de combustible en tiempo real.";
const DEFAULT_IMAGE = `${SITE_URL}/pwa-512x512.png`;

const ROUTE_SEO: Array<{ test: (path: string) => boolean; config: SeoConfig }> = [
  {
    test: (path) => path === "/",
    config: {
      title: "TankGo - Gasolineras baratas cerca de ti",
      description:
        "Compara precios de gasolina y diesel en toda Espana. Ahorra en cada repostaje con TankGo.",
      canonicalPath: "/",
    },
  },
  {
    test: (path) => path === "/gasolineras",
    config: {
      title: "Gasolineras baratas en Espana | TankGo",
      description:
        "Busca gasolineras baratas, filtra por combustible y encuentra el mejor precio cerca de ti.",
      canonicalPath: "/gasolineras",
    },
  },
  {
    test: (path) => path === "/mapa",
    config: {
      title: "Mapa de gasolineras | TankGo",
      description:
        "Explora en el mapa las gasolineras mas cercanas y compara precios en tiempo real.",
      canonicalPath: "/mapa",
    },
  },
  {
    test: (path) => path === "/recarga",
    config: {
      title: "Mapa de puntos de recarga | TankGo",
      description:
        "Encuentra puntos de recarga y planifica tu ruta con facilidad.",
      canonicalPath: "/recarga",
    },
  },
  {
    test: (path) => path === "/faq",
    config: {
      title: "Preguntas frecuentes | TankGo",
      description: "Resuelve dudas comunes sobre precios, mapas y alertas.",
      canonicalPath: "/faq",
    },
  },
  {
    test: (path) => path === "/legal",
    config: {
      title: "Aviso legal | TankGo",
      description: "Informacion legal y condiciones de uso de TankGo.",
      canonicalPath: "/legal",
    },
  },
  {
    test: (path) => path === "/privacy",
    config: {
      title: "Politica de privacidad | TankGo",
      description: "Consulta como tratamos tus datos y tu privacidad.",
      canonicalPath: "/privacy",
    },
  },
  {
    test: (path) => path === "/accessibility",
    config: {
      title: "Accesibilidad | TankGo",
      description: "Compromiso de accesibilidad y mejoras continuas.",
      canonicalPath: "/accessibility",
    },
  },
  {
    test: (path) => path === "/login" || path === "/register",
    config: {
      title: "Acceso | TankGo",
      description: "Accede o crea una cuenta para personalizar tu experiencia.",
      canonicalPath: "/login",
      noIndex: true,
    },
  },
  {
    test: (path) =>
      path === "/profile" || path === "/favoritos" || path === "/rutas",
    config: {
      title: "Area privada | TankGo",
      description: "Gestiona tu perfil y tus favoritos en TankGo.",
      canonicalPath: "/profile",
      noIndex: true,
    },
  },
  {
    test: (path) => path.startsWith("/gasolinera/"),
    config: {
      title: "Detalle de gasolinera | TankGo",
      description:
        "Consulta precios y detalles de una gasolinera especifica en TankGo.",
      canonicalPath: "/gasolineras",
      noIndex: true,
    },
  },
];

function getSeoConfig(pathname: string): SeoConfig {
  const normalized = pathname.split("?")[0].split("#")[0];
  const match = ROUTE_SEO.find((item) => item.test(normalized));
  if (match) {
    return match.config;
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonicalPath: "/",
    noIndex: true,
  };
}

function upsertMetaTag(name: string, content: string, attr: "name" | "property" = "name") {
  const selector = `meta[${attr}="${name}"]`;
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, name);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertLinkTag(rel: string, href: string) {
  let element = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

export function applyPageMeta(pathname: string) {
  const config = getSeoConfig(pathname);
  const canonicalUrl = `${SITE_URL}${config.canonicalPath}`;

  document.title = config.title;

  upsertMetaTag("description", config.description);
  upsertMetaTag("robots", config.noIndex ? "noindex, nofollow" : "index, follow");

  upsertMetaTag("og:title", config.title, "property");
  upsertMetaTag("og:description", config.description, "property");
  upsertMetaTag("og:type", "website", "property");
  upsertMetaTag("og:url", canonicalUrl, "property");
  upsertMetaTag("og:image", DEFAULT_IMAGE, "property");
  upsertMetaTag("og:site_name", "TankGo", "property");

  upsertMetaTag("twitter:card", "summary_large_image");
  upsertMetaTag("twitter:title", config.title);
  upsertMetaTag("twitter:description", config.description);
  upsertMetaTag("twitter:image", DEFAULT_IMAGE);

  upsertLinkTag("canonical", canonicalUrl);
}
