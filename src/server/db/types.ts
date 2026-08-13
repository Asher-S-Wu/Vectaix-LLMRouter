import type { ObjectId } from "mongodb";

export type ModelRestrictionMode = "all" | "allow" | "exclude";

export interface UserDocument {
  _id: ObjectId;
  username: string;
  usernameKey: string;
  passwordHash: string;
  modelMode: ModelRestrictionMode;
  models: string[];
  createdAt: Date;
}

export interface ProxyKeyDocument {
  _id: ObjectId;
  userId: ObjectId | null;
  name: string;
  prefix: string;
  keyHash: string;
  keyEncrypted?: string;
  createdAt: Date;
}

export interface LoginAttemptDocument {
  _id: string;
  failures: number;
  firstAttemptAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CodexProxyKeyDocument {
  _id: ObjectId;
  name: string;
  prefix: string;
  keyHash: string;
  keyEncrypted: string;
  createdAt: Date;
}

export type CodexCredentialStatus = "connected" | "reconnect_required";

export interface CodexCredentialDocument {
  _id: "primary";
  status: CodexCredentialStatus;
  accountId: string;
  email: string | null;
  plan: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: Date;
  connectedAt: Date;
  updatedAt: Date;
  failureMessage: string | null;
  refreshVersion: number;
  refreshLeaseId: string | null;
  refreshLeaseExpiresAt: Date | null;
}

export type CodexAuthSessionState = "starting" | "pending";

export interface CodexAuthSessionDocument {
  _id: "active";
  state: CodexAuthSessionState;
  deviceCode: string;
  deviceAuthIdEncrypted: string | null;
  userCodeEncrypted: string | null;
  intervalSeconds: number;
  nextPollAt: Date;
  pollLeaseId: string | null;
  pollLeaseExpiresAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}
