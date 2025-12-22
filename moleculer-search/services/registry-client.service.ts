import { Service, ServiceBroker } from "moleculer";
import axios from "axios";

interface ServiceRegistration {
  serviceName: string;
  operations: string[];
  endpoint: string;
  healthCheck: string;
  metadata?: Record<string, any>;
}

export default class RegistryClientService extends Service {
  private registryUrl: string;
  private serviceEndpoint: string;
  private registrationInterval: NodeJS.Timeout | null = null;

  constructor(broker: ServiceBroker) {
    super(broker);

    this.parseServiceSchema({
      name: "registry-client",

      settings: {
        registryUrl: process.env.SERVICE_REGISTRY_URL || "http://localhost:8085/api/registry",
        serviceHost: process.env.SERVICE_HOST || "localhost",
        servicePort: process.env.SERVICE_PORT || 4050,
        registrationIntervalMs: 30000 // Re-register every 30 seconds
      },

      actions: {
        register: {
          async handler(): Promise<void> {
            return this.registerWithSpring();
          }
        }
      },

      started: async () => {
        this.registryUrl = this.settings.registryUrl;
        this.serviceEndpoint = `http://${this.settings.serviceHost}:${this.settings.servicePort}`;

        // Initial registration
        await this.registerWithSpring();

        // Periodic re-registration (heartbeat)
        this.registrationInterval = setInterval(
          () => this.registerWithSpring(),
          this.settings.registrationIntervalMs
        );

        this.logger.info(`Registry client started. Will register with ${this.registryUrl}`);
      },

      stopped: async () => {
        if (this.registrationInterval) {
          clearInterval(this.registrationInterval);
        }
        // Optionally: deregister from Spring
      }
    });

    this.registryUrl = "";
    this.serviceEndpoint = "";
    this.registrationInterval = null;
  }

  async registerWithSpring(): Promise<void> {
    const registration: ServiceRegistration = {
      serviceName: "moleculer-search",
      operations: ["simpleSearch"],
      endpoint: this.serviceEndpoint,
      healthCheck: `${this.serviceEndpoint}/api/health`,
      metadata: {
        type: "moleculer",
        version: "1.0.0",
        provider: "google"
      }
    };

    // Extract port from endpoint
    const portMatch = this.serviceEndpoint.match(/:(\d+)/);
    const port = portMatch ? parseInt(portMatch[1]) : 4050;

    // Register directly with host-server REST API
    const registrationPayload = {
      serviceName: registration.serviceName,
      operations: registration.operations,
      endpoint: registration.endpoint,
      healthCheck: registration.healthCheck,
      metadata: registration.metadata,
      framework: "Moleculer",
      version: "1.0.0",
      port: port
    };

    try {
      const response = await axios.post(`${this.registryUrl}/register`, registrationPayload, {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 5000
      });

      this.logger.info(`Successfully registered with Host Server: ${response.data.message || "OK"}`);
    } catch (error: any) {
      this.logger.warn(`Failed to register with Host Server: ${error.message}`);
      // Don't throw - service should continue running even if registration fails
    }
  }
}