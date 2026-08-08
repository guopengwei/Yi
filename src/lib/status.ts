import { api } from "./api";

export interface ServiceStatus {
  schemaVersion: "service-status@1";
  environment: "development" | "preview" | "production";
  deterministicReadings: boolean;
  aiEnabled: boolean;
  catalogReviewed: boolean;
  emailPasswordEnabled: boolean;
  googleAuthEnabled: boolean;
  microsoftAuthEnabled: boolean;
  paymentsEnabled: boolean;
  subscriptionsEnabled: boolean;
}

export function getServiceStatus() {
  return api<ServiceStatus>("/api/v1/status");
}
