const json = { type: 'object', additionalProperties: true }

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Nilam API',
    version: '0.1.0',
    description: 'Marketplace storefront API and token-protected ERP administration API.',
  },
  servers: [{ url: '/', description: 'Current server' }],
  tags: [
    { name: 'Storefront', description: 'Public catalogue endpoints.' },
    { name: 'Admin', description: 'ERP endpoints. Supply the x-admin-token header.' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Storefront'], summary: 'Check API and database health',
        responses: { 200: { description: 'API and database are available' }, 503: { description: 'Database is unavailable' } },
      },
    },
    '/api/products': {
      get: {
        tags: ['Storefront'], summary: 'List active products',
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Search product name or description' },
          { in: 'query', name: 'category', schema: { type: 'string' }, description: 'Category handle' },
        ],
        responses: { 200: { description: 'Active products', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/StorefrontProduct' } } } } } },
      },
    },
    '/api/products/{handle}': {
      get: {
        tags: ['Storefront'], summary: 'Get an active product by handle',
        parameters: [{ $ref: '#/components/parameters/ProductHandle' }],
        responses: { 200: { description: 'Product', content: { 'application/json': { schema: { $ref: '#/components/schemas/StorefrontProduct' } } } }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/api/admin/dashboard': {
      get: {
        tags: ['Admin'], summary: 'Get ERP dashboard metrics', security: [{ AdminToken: [] }],
        responses: { 200: { description: 'Metrics', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dashboard' } } } }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/api/admin/products': {
      get: {
        tags: ['Admin'], summary: 'List all products', security: [{ AdminToken: [] }],
        parameters: [{ in: 'query', name: 'q', schema: { type: 'string' }, description: 'Search name or handle' }],
        responses: { 200: { description: 'Products', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AdminProduct' } } } } }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
      post: {
        tags: ['Admin'], summary: 'Create a product', security: [{ AdminToken: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProduct' } } } },
        responses: { 201: { description: 'Product created', content: { 'application/json': { schema: json } } }, 400: { $ref: '#/components/responses/BadRequest' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/api/admin/products/{id}': {
      patch: {
        tags: ['Admin'], summary: 'Update a product', security: [{ AdminToken: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProduct' } } } },
        responses: { 200: { description: 'Product updated', content: { 'application/json': { schema: json } } }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/api/admin/categories': {
      get: { tags: ['Admin'], summary: 'List categories', security: [{ AdminToken: [] }], responses: { 200: { description: 'Categories', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Category' } } } } } } },
      post: { tags: ['Admin'], summary: 'Create a category', security: [{ AdminToken: [] }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NamedResource' } } } }, responses: { 201: { description: 'Category created' }, 400: { $ref: '#/components/responses/BadRequest' } } },
    },
    '/api/admin/categories/{id}': {
      patch: { tags: ['Admin'], summary: 'Update a category', security: [{ AdminToken: [] }], parameters: [{ $ref: '#/components/parameters/Id' }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NamedResource' } } } }, responses: { 200: { description: 'Category updated' }, 404: { $ref: '#/components/responses/NotFound' } } },
      delete: { tags: ['Admin'], summary: 'Delete an empty category', security: [{ AdminToken: [] }], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { 204: { description: 'Category deleted' }, 409: { description: 'Category still has products' } } },
    },
    '/api/admin/collections': {
      get: { tags: ['Admin'], summary: 'List collections', security: [{ AdminToken: [] }], responses: { 200: { description: 'Collections' } } },
      post: { tags: ['Admin'], summary: 'Create a collection', security: [{ AdminToken: [] }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Collection' } } } }, responses: { 201: { description: 'Collection created' } } },
    },
    '/api/admin/collections/{id}': {
      patch: { tags: ['Admin'], summary: 'Update a collection', security: [{ AdminToken: [] }], parameters: [{ $ref: '#/components/parameters/Id' }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Collection' } } } }, responses: { 200: { description: 'Collection updated' } } },
      delete: { tags: ['Admin'], summary: 'Delete an empty collection', security: [{ AdminToken: [] }], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { 204: { description: 'Collection deleted' }, 409: { description: 'Collection still has products' } } },
    },
    '/api/admin/inventory': {
      get: { tags: ['Admin'], summary: 'List inventory', security: [{ AdminToken: [] }], responses: { 200: { description: 'Inventory records' } } },
    },
    '/api/admin/inventory/{variantId}': {
      patch: {
        tags: ['Admin'], summary: 'Set variant inventory quantity', security: [{ AdminToken: [] }],
        parameters: [{ in: 'path', name: 'variantId', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 0 } } } } } },
        responses: { 200: { description: 'Inventory updated' }, 400: { $ref: '#/components/responses/BadRequest' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
  },
  components: {
    securitySchemes: { AdminToken: { type: 'apiKey', in: 'header', name: 'x-admin-token', description: 'Value of ADMIN_API_TOKEN.' } },
    parameters: {
      Id: { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
      ProductHandle: { in: 'path', name: 'handle', required: true, schema: { type: 'string' } },
    },
    responses: {
      BadRequest: { description: 'Invalid request payload' },
      NotFound: { description: 'Resource not found' },
      Unauthorized: { description: 'Missing or invalid admin token' },
    },
    schemas: {
      StorefrontProduct: { type: 'object', required: ['id', 'handle', 'name', 'price'], properties: { id: { type: 'string' }, handle: { type: 'string' }, name: { type: 'string' }, category: { type: 'string' }, price: { type: 'integer', description: 'IDR' }, image: { type: 'string' }, description: { type: 'string' } } },
      Dashboard: { type: 'object', properties: { productCount: { type: 'integer' }, orderCount: { type: 'integer' }, pendingOrders: { type: 'integer' }, lowStock: { type: 'integer' }, netSales: { type: 'integer', description: 'IDR' } } },
      AdminProduct: { allOf: [{ $ref: '#/components/schemas/StorefrontProduct' }, { type: 'object', properties: { status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] }, stock: { type: 'integer' } } }] },
      NamedResource: { type: 'object', required: ['name', 'handle'], properties: { name: { type: 'string' }, handle: { type: 'string', pattern: '^[a-z0-9-]+$' } } },
      Collection: { allOf: [{ $ref: '#/components/schemas/NamedResource' }, { type: 'object', properties: { description: { type: 'string' } } }] },
      CreateProduct: { type: 'object', required: ['name', 'handle', 'description', 'categoryId', 'status', 'sku', 'price', 'quantity'], properties: { name: { type: 'string' }, handle: { type: 'string' }, description: { type: 'string' }, categoryId: { type: 'string' }, status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] }, sku: { type: 'string' }, price: { type: 'integer', minimum: 0 }, quantity: { type: 'integer', minimum: 0 }, image: { type: 'string', format: 'uri' } } },
      UpdateProduct: { type: 'object', required: ['name', 'handle', 'description', 'categoryId', 'status'], properties: { name: { type: 'string' }, handle: { type: 'string' }, description: { type: 'string' }, categoryId: { type: 'string' }, status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] } } },
      Category: { allOf: [{ $ref: '#/components/schemas/NamedResource' }, { type: 'object', properties: { id: { type: 'string' } } }] },
    },
  },
} as const
