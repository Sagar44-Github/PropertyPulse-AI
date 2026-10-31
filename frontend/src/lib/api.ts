import type {
  DashboardData,
  DemoSample,
  Finding,
  FindingReviewEvent,
  GuidedCase,
  IssueTrend,
  Inspection,
  InspectionImage,
  MaintenanceTask,
  ModelStatus,
  PropertyRecord,
  User,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8100";
const TOKEN_KEY = "propertypulse.access";

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(API_BASE + path, { ...init, headers });
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/pdf")) return (await response.blob()) as T;
  return (await response.json()) as T;
}

export const api = {
  async demoLogin() {
    const result = await request<{ access_token: string; user: User }>("/api/v1/auth/demo", { method: "POST" });
    setToken(result.access_token);
    return result.user;
  },
  async login(email: string, password: string) {
    const result = await request<{ access_token: string; user: User }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(result.access_token);
    return result.user;
  },
  async register(name: string, email: string, password: string) {
    const result = await request<{ access_token: string; user: User }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setToken(result.access_token);
    return result.user;
  },
  me: () => request<User>("/api/v1/auth/me"),
  updateProfile: (name: string) =>
    request<User>("/api/v1/auth/me", { method: "PATCH", body: JSON.stringify({ name }) }),
  dashboard: () => request<DashboardData>("/api/v1/dashboard"),
  properties: () => request<PropertyRecord[]>("/api/v1/properties"),
  createProperty: (payload: Partial<PropertyRecord>) =>
    request<PropertyRecord>("/api/v1/properties", { method: "POST", body: JSON.stringify(payload) }),
  updateProperty: (id: number, payload: Partial<PropertyRecord>) =>
    request<PropertyRecord>("/api/v1/properties/" + id, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteProperty: (id: number) =>
    request<{ deleted: boolean }>("/api/v1/properties/" + id, { method: "DELETE" }),
  property: (id: number) => request<PropertyRecord>("/api/v1/properties/" + id),
  history: (id: number) => request<Inspection[]>("/api/v1/properties/" + id + "/history"),
  createInspection: (propertyId: number, payload: Record<string, unknown>) =>
    request<Inspection>("/api/v1/properties/" + propertyId + "/inspections", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  inspection: (id: number) => request<Inspection>("/api/v1/inspections/" + id),
  upload: (inspectionId: number, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<InspectionImage>("/api/v1/inspections/" + inspectionId + "/images", {
      method: "POST",
      body,
    });
  },
  samples: () => request<DemoSample[]>("/api/v1/demo/samples"),
  addSample: (inspectionId: number, sampleId: string) =>
    request<InspectionImage>("/api/v1/inspections/" + inspectionId + "/samples/" + encodeURIComponent(sampleId), {
      method: "POST",
    }),
  analyze: (imageId: number) =>
    request<{ image: InspectionImage; analysis: Record<string, unknown>; assessment: Record<string, unknown>; finding: Finding }>(
      "/api/v1/images/" + imageId + "/analyze",
      { method: "POST" },
    ),
  annotate: (imageId: number, payload: Record<string, unknown>) =>
    request<Finding>("/api/v1/images/" + imageId + "/annotations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reviewFinding: (id: number, payload: Record<string, unknown>) =>
    request<Finding>("/api/v1/findings/" + id, { method: "PATCH", body: JSON.stringify(payload) }),
  findingReviews: (id: number) => request<FindingReviewEvent[]>("/api/v1/findings/" + id + "/reviews"),
  markRegion: (id: number, payload: Record<string, unknown>) =>
    request<Finding>("/api/v1/findings/" + id + "/region", { method: "PUT", body: JSON.stringify(payload) }),
  createReport: (inspectionId: number) =>
    request<{ id: number; download_url: string; generated_at: string }>(
      "/api/v1/inspections/" + inspectionId + "/reports",
      { method: "POST" },
    ),
  downloadReport: (reportId: number) =>
    request<Blob>("/api/v1/reports/" + reportId + "/download"),
  model: () => request<ModelStatus>("/api/v1/model"),
  guidedCase: () => request<GuidedCase>("/api/v1/demo/case/seed", { method: "POST" }),
  resetGuidedCase: () => request<{ reset: boolean }>("/api/v1/demo/case", { method: "DELETE" }),
  tasks: (filters: { status?: string; property_id?: number } = {}) => {
    const query = new URLSearchParams();
    if (filters.status) query.set("status", filters.status);
    if (filters.property_id) query.set("property_id", String(filters.property_id));
    return request<MaintenanceTask[]>("/api/v1/tasks" + (query.size ? "?" + query.toString() : ""));
  },
  createTask: (payload: { property_id: number; inspection_id?: number | null; finding_id?: number | null; title: string; description?: string | null; assignee?: string | null; due_date?: string | null; priority?: string; status?: string }) =>
    request<MaintenanceTask>("/api/v1/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (id: number, payload: Partial<Pick<MaintenanceTask, "title" | "description" | "assignee" | "due_date" | "priority" | "status" | "completion_note">>) =>
    request<MaintenanceTask>("/api/v1/tasks/" + id, { method: "PATCH", body: JSON.stringify(payload) }),
  recordTrend: (findingId: number, payload: { previous_finding_id: number; trend_state: string; note?: string | null }) =>
    request<IssueTrend>("/api/v1/findings/" + findingId + "/trends", { method: "POST", body: JSON.stringify(payload) }),
  trends: (propertyId: number) => request<IssueTrend[]>("/api/v1/properties/" + propertyId + "/trends"),
};

export function mediaUrl(path: string | null | undefined) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return API_BASE + path;
}
