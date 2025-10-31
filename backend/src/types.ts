export interface Drawing {
  id: string;
  slug: string;
  encrypted_data: Buffer;
  encryption_key: string;
  version: number;
  created_at: Date;
  updated_at: Date;
  last_accessed_at: Date;
}

export interface CreateDrawingRequest {
  slug: string;
  encrypted_data: string; // base64 encoded
  encryption_key: string;
}

export interface UpdateDrawingRequest {
  encrypted_data: string; // base64 encoded
  encryption_key: string;
}

export interface DrawingResponse {
  id: string;
  slug: string;
  encrypted_data: string; // base64 encoded
  encryption_key: string;
  version: number;
  created_at: string;
  updated_at: string;
}
