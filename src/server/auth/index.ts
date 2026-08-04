export {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_SECONDS,
  USER_SESSION_COOKIE,
  USER_SESSION_SECONDS,
  AdminAuthenticationError,
  UserAuthenticationError,
  clearAdminSession,
  clearUserSession,
  createAdminSession,
  createUserSession,
  getAdminSession,
  getUserSession,
  requireAdminSession,
  requireUserSession,
  type AdminSession,
  type UserSession,
} from "@/server/auth/session";
export {
  verifyAdminLogin,
  type AdminLoginCheck,
} from "@/server/auth/admin";
