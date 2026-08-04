import type { ObjectId } from "mongodb";

export interface ProxyKeyDocument {
  _id: ObjectId;
  name: string;
  prefix: string;
  keyHash: string;
  createdAt: Date;
}

export interface LoginAttemptDocument {
  _id: string;
  failures: number;
  firstAttemptAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}
