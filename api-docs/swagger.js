const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Whatsapp WhiskeySocket API",
      version: "1.0.0",
      description:
        "Çoklu WhatsApp oturumu, sohbet/grup mesajlaşma ve MongoDB ilişkisel hareket kayıt API dokümantasyonu (Local - Auth Devre Dışı)",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3002}`,
      },
    ],
  },
  apis: ["./app.js", "./routes/*.js"],
};

const swaggerSpec = swaggerJsDoc(options);

function setupSwagger(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = setupSwagger;
