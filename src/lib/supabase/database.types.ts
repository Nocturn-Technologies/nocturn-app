// Permissive database type — allows any table/column access without generated types.
// Replace with `supabase gen types typescript` output when ready.
//
// This provides a GenericSchema-compatible type that resolves Supabase
// query results as Record<string, unknown> instead of `never`.

/* eslint-disable @typescript-eslint/no-explicit-any */

type PermissiveTable = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    isOneToOne?: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }[];
};

type PermissiveView = {
  Row: Record<string, any>;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    isOneToOne?: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }[];
};

type PermissiveFunction = {
  Args: Record<string, any>;
  Returns: any;
};

export type Database = {
  public: {
    Tables: Record<string, PermissiveTable>;
    Views: Record<string, PermissiveView>;
    Functions: Record<string, PermissiveFunction>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, unknown>;
  };
};
