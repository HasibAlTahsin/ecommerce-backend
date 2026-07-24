import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const spec = {
  openapi: '3.0.0',
  info: {
    title: 'E-Commerce Ordering & Payment System',
    version: '1.0.0',
    description:
      'Multi-provider payment backend with atomic stock management and webhook idempotency.',
  },
  servers: [{ url: 'http://localhost:3000' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'User created' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'JWT returned' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/products': {
      get: {
        tags: ['Products'],
        summary: 'List active products',
        responses: { '200': { description: 'A list of products' } },
      },
    },
    '/api/products/{publicId}/recommendations': {
      get: {
        tags: ['Products'],
        summary: 'Related products via DFS over the category tree',
        parameters: [
          { name: 'publicId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Recommended products' } },
      },
    },
    '/api/orders': {
      post: {
        tags: ['Orders'],
        summary: 'Create an order',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['productPublicId', 'quantity'],
                      properties: {
                        productPublicId: { type: 'string' },
                        quantity: { type: 'integer', minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Order created' },
          '409': { description: 'Insufficient stock' },
        },
      },
    },
    '/api/orders/{id}/checkout': {
      post: {
        tags: ['Orders'],
        summary: 'Start checkout for an order',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['provider'],
                properties: {
                  provider: { type: 'string', enum: ['STRIPE', 'BKASH', 'MOCK'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Provider payload returned' },
          '409': { description: 'Order not in a checkoutable state' },
        },
      },
    },
    '/api/webhooks/{provider}': {
      post: {
        tags: ['Webhooks'],
        summary: 'Signed provider webhook (raw body)',
        parameters: [
          { name: 'provider', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Received' },
          '400': { description: 'Invalid signature' },
        },
      },
    },
  },
};

export function mountSwagger(app: Express): void {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
