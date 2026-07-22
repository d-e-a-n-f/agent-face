import { defineAgentApplication } from "@agentface/core";

/**
 * The playground's static application manifest: every screen, its faces,
 * its entities. Consumed by <AgentFaceApp> (navigation, application-map
 * resource, assistant context, DevTools coverage) and by the CLI
 * (`agentface doctor`, `agentface generate-manifest`).
 */
export const applicationManifest = defineAgentApplication({
  id: "agentface-playground",
  name: "AgentFace Playground",
  routes: [
    { path: "/", description: "Playground home", surfaces: [] },
    {
      path: "/examples/counter",
      description: "Counter learning example",
      surfaces: ["examples.counter"],
    },
    { path: "/portal", description: "Portal home", surfaces: [] },
    {
      path: "/portal/clients",
      description: "Client list",
      surfaces: ["portal.clients"],
      entities: ["client"],
    },
    {
      path: "/portal/clients/:clientId",
      description: "One client: profile, onboarding status, invoices",
      surfaces: ["portal.client"],
      entities: ["client"],
    },
    {
      path: "/portal/clients/:clientId/onboarding",
      description: "The client's onboarding form",
      surfaces: ["portal.onboarding"],
      entities: ["client"],
    },
    {
      path: "/portal/invoices/:invoiceId",
      description: "One invoice: add line items, discount, send",
      surfaces: ["portal.invoice"],
      entities: ["invoice"],
    },
  ],
});

export default applicationManifest;
