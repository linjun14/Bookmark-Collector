export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      bookmark: {
        Row: {
          id: number;
          created_at: string;
          title: string;
          type: string;
          folder: string | null;
          url: string;
          note: string | null;
          tags: Json;
        };
        Insert: {
          id?: number;
          created_at?: string;
          title: string;
          type: string;
          folder?: string | null;
          url: string;
          note?: string | null;
          tags?: Json;
        };
        Update: {
          id?: number;
          created_at?: string;
          title?: string;
          type?: string;
          folder?: string | null;
          url?: string;
          note?: string | null;
          tags?: Json;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
