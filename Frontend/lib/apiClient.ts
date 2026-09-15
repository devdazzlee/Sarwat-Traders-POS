import { API_BASE } from "@/config/constants";
import axios, { InternalAxiosRequestConfig } from "axios";

/** Use on `apiClient.post(..., { timeout: BULK_UPLOAD_AXIOS_TIMEOUT_MS })` — bulk work can exceed the default client cap. */
export const BULK_UPLOAD_AXIOS_TIMEOUT_MS = 0;

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes – large base64 image payloads need more time
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — no automatic logout on 401.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export default apiClient;
