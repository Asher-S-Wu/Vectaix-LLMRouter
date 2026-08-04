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
