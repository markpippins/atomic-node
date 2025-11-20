# Moleculer Search Service

A Moleculer-based microservices application providing multiple search providers (Google, Gemini, Unsplash, etc.) that integrates with the Spring Boot broker-gateway via service registration.

## Architecture

```
Angular Client -> Spring Broker Gateway -> Service Registry -> Moleculer Search Service
                                                              ├── Google Search
                                                              ├── Gemini Search (future)
                                                              └── Unsplash Search (future)
```

## Features

- **Modular Search Providers**: Each search type is an independent Moleculer service
- **Service Registration**: Automatically registers with Spring service-registry on startup
- **Health Checks**: Provides health endpoints for monitoring
- **RESTful API**: Exposes HTTP endpoints via moleculer-web
- **Hot Reload**: Development mode with automatic service reloading

## Services

### google-search
Provides Google Custom Search API integration
- **Action**: `simpleSearch` - Performs basic Google search
- **Params**: `{ query: string, token?: string }`

### api
HTTP gateway service using moleculer-web
- **Endpoint**: `POST /api/search/simple` - Trigger Google search
- **Endpoint**: `GET /api/health` - Health check

### registry-client
Handles registration with Spring service-registry
- Registers on startup
- Periodic heartbeat re-registration
- Automatic retry on failure

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Google API credentials
```

3. Run in development mode:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## Environment Variables

- `SERVICE_REGISTRY_URL` - Spring service registry endpoint (default: http://localhost:8080/api/registry)
- `GOOGLE_API_KEY` - Google Custom Search API key
- `GOOGLE_SEARCH_ENGINE_ID` - Google Custom Search Engine ID
- `SERVICE_PORT` - Port for HTTP API (default: 4050)
- `SERVICE_HOST` - Host for service registration (default: localhost)

## Integration with Spring

The service automatically registers with the Spring service-registry on startup:

```json
{
  "serviceName": "googleSearchService",
  "operations": ["simpleSearch"],
  "endpoint": "http://localhost:4050",
  "healthCheck": "http://localhost:4050/api/health"
}
```

The Spring broker-gateway will route requests to this service based on the registered operations.

## Adding New Search Providers

Create a new service file in `services/`:

```typescript
// services/gemini-search.service.ts
import { Service, ServiceBroker, Context } from "moleculer";

export default class GeminiSearchService extends Service {
  constructor(broker: ServiceBroker) {
    super(broker);
    this.parseServiceSchema({
      name: "gemini-search",
      actions: {
        search: {
          params: { query: "string" },
          async handler(ctx: Context) {
            // Implement Gemini search
          }
        }
      }
    });
  }
}
```

Then update `registry-client.service.ts` to include the new operation in registration.