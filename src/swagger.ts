import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";
import staticSwaggerSpec from "./swagger-spec.json";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ERP Store API",
      version: "1.0.0",
      description: "API documentation for the ERP Store Backend",
    },
    servers: [
      {
        url: "https://witch-store-backend.vercel.app",
        description: "Production server (Vercel)",
      },
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts"],
};

const dynamicSpec = swaggerJsdoc(options);

// If dynamic scanning yielded no paths (common in serverless / bundled environments), use the pre-generated spec
const swaggerSpec =
  (dynamicSpec as any).paths && Object.keys((dynamicSpec as any).paths).length > 0
    ? dynamicSpec
    : (staticSwaggerSpec as any);

const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customCssUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css",
  customJs: [
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js",
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js",
  ],
};

export const setupSwagger = (app: Express) => {
  // Common redirect aliases so urls like /api/swagger/index.html or /swagger open seamlessly
  const aliases = [
    "/api/swagger",
    "/api/swagger/index.html",
    "/swagger",
    "/swagger/index.html",
    "/docs",
  ];
  app.get(aliases, (_req, res) => {
    res.redirect("/api-docs");
  });

  // Serve Swagger UI
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, swaggerUiOptions),
  );

  // Expose the OpenAPI JSON spec
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  console.log(
    `📄 Swagger docs available at /api-docs (or http://localhost:${process.env.PORT || 3000}/api-docs)`,
  );
};

