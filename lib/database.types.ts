export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_requests: {
        Row: {
          created_at: string | null
          endpoint: string
          est_tokens: number | null
          id: string
          latency_ms: number | null
          model: string | null
          source_count: number | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          est_tokens?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          source_count?: number | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          est_tokens?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          source_count?: number | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_summaries: {
        Row: {
          created_at: string | null
          experiment_id: string | null
          id: string
          model: string | null
          scope: string | null
          source_ids: string[] | null
          summary: string | null
        }
        Insert: {
          created_at?: string | null
          experiment_id?: string | null
          id?: string
          model?: string | null
          scope?: string | null
          source_ids?: string[] | null
          summary?: string | null
        }
        Update: {
          created_at?: string | null
          experiment_id?: string | null
          id?: string
          model?: string | null
          scope?: string | null
          source_ids?: string[] | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_summaries_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_embeddings: {
        Row: {
          content: string | null
          embedding: string | null
          experiment_id: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          experiment_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          experiment_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_embeddings_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: true
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_files: {
        Row: {
          byte_size: number | null
          created_at: string | null
          experiment_id: string | null
          file_type: string | null
          id: string
          kind: string | null
          label: string | null
          mime_type: string | null
          sha256: string | null
          storage_path: string | null
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string | null
          experiment_id?: string | null
          file_type?: string | null
          id?: string
          kind?: string | null
          label?: string | null
          mime_type?: string | null
          sha256?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string | null
          experiment_id?: string | null
          file_type?: string | null
          id?: string
          kind?: string | null
          label?: string | null
          mime_type?: string | null
          sha256?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_files_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_revisions: {
        Row: {
          created_at: string | null
          editor_id: string | null
          experiment_id: string | null
          id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string | null
          editor_id?: string | null
          experiment_id?: string | null
          id?: string
          snapshot: Json
        }
        Update: {
          created_at?: string | null
          editor_id?: string | null
          experiment_id?: string | null
          id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "experiment_revisions_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          compounds: string[] | null
          concentration: string | null
          created_at: string | null
          cycles: number | null
          date: string | null
          deleted_at: string | null
          id: string
          metals: string[] | null
          methods: string[] | null
          mz: number[] | null
          name: string
          notes: string | null
          observations: string | null
          owner_id: string | null
          ph: number | null
          project: string | null
          reaction_type: string | null
          researcher: string | null
          temperature: string | null
          updated_at: string | null
        }
        Insert: {
          compounds?: string[] | null
          concentration?: string | null
          created_at?: string | null
          cycles?: number | null
          date?: string | null
          deleted_at?: string | null
          id: string
          metals?: string[] | null
          methods?: string[] | null
          mz?: number[] | null
          name: string
          notes?: string | null
          observations?: string | null
          owner_id?: string | null
          ph?: number | null
          project?: string | null
          reaction_type?: string | null
          researcher?: string | null
          temperature?: string | null
          updated_at?: string | null
        }
        Update: {
          compounds?: string[] | null
          concentration?: string | null
          created_at?: string | null
          cycles?: number | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          metals?: string[] | null
          methods?: string[] | null
          mz?: number[] | null
          name?: string
          notes?: string | null
          observations?: string | null
          owner_id?: string | null
          ph?: number | null
          project?: string | null
          reaction_type?: string | null
          researcher?: string | null
          temperature?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiments_project_fkey"
            columns: ["project"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      index_jobs: {
        Row: {
          attempts: number
          embedding_dimensions: number | null
          embedding_model: string | null
          experiment_id: string
          last_error: string | null
          next_attempt_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          embedding_dimensions?: number | null
          embedding_model?: string | null
          experiment_id: string
          last_error?: string | null
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          embedding_dimensions?: number | null
          embedding_model?: string | null
          experiment_id?: string
          last_error?: string | null
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "index_jobs_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: true
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          initials: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          initials?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          initials?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          color: string | null
          id: string
          label: string
          owner_id: string | null
        }
        Insert: {
          color?: string | null
          id: string
          label: string
          owner_id?: string | null
        }
        Update: {
          color?: string | null
          id?: string
          label?: string
          owner_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_experiments: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          id: string
          name: string
          similarity: number
        }[]
      }
      next_experiment_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
