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
      ai_feedback: {
        Row: {
          ai_request_id: string
          created_at: string
          id: string
          note: string | null
          rating: string
          user_id: string | null
        }
        Insert: {
          ai_request_id: string
          created_at?: string
          id?: string
          note?: string | null
          rating: string
          user_id?: string | null
        }
        Update: {
          ai_request_id?: string
          created_at?: string
          id?: string
          note?: string | null
          rating?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_ai_request_id_fkey"
            columns: ["ai_request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_versions: {
        Row: {
          chat_model: string
          embedding_dimensions: number | null
          embedding_model: string | null
          first_seen_at: string
          id: string
          provider: string
        }
        Insert: {
          chat_model: string
          embedding_dimensions?: number | null
          embedding_model?: string | null
          first_seen_at?: string
          id?: string
          provider: string
        }
        Update: {
          chat_model?: string
          embedding_dimensions?: number | null
          embedding_model?: string | null
          first_seen_at?: string
          id?: string
          provider?: string
        }
        Relationships: []
      }
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
      ai_retrieval_events: {
        Row: {
          ai_request_id: string | null
          ask_mode: string
          created_at: string
          id: string
          query: string
          retrieved: Json
          router_mode: string | null
          user_id: string | null
        }
        Insert: {
          ai_request_id?: string | null
          ask_mode: string
          created_at?: string
          id?: string
          query: string
          retrieved?: Json
          router_mode?: string | null
          user_id?: string | null
        }
        Update: {
          ai_request_id?: string | null
          ask_mode?: string
          created_at?: string
          id?: string
          query?: string
          retrieved?: Json
          router_mode?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_retrieval_events_ai_request_id_fkey"
            columns: ["ai_request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          experiment_id?: string | null
          id?: string
          model?: string | null
          scope?: string | null
          source_ids?: string[] | null
          summary?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          experiment_id?: string | null
          id?: string
          model?: string | null
          scope?: string | null
          source_ids?: string[] | null
          summary?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_summaries_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summaries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_files: {
        Row: {
          analysis_run_id: string
          created_at: string
          file_role: string
          filename: string | null
          id: string
          uploaded_by: string | null
          url: string | null
          workspace_id: string | null
        }
        Insert: {
          analysis_run_id: string
          created_at?: string
          file_role: string
          filename?: string | null
          id?: string
          uploaded_by?: string | null
          url?: string | null
          workspace_id?: string | null
        }
        Update: {
          analysis_run_id?: string
          created_at?: string
          file_role?: string
          filename?: string | null
          id?: string
          uploaded_by?: string | null
          url?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_files_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_results: {
        Row: {
          analysis_run_id: string
          created_at: string
          details: Json
          id: string
          interpreted_by: string | null
          quality_notes: string | null
          result_confidence: string | null
          summary: string | null
          workspace_id: string | null
        }
        Insert: {
          analysis_run_id: string
          created_at?: string
          details?: Json
          id?: string
          interpreted_by?: string | null
          quality_notes?: string | null
          result_confidence?: string | null
          summary?: string | null
          workspace_id?: string | null
        }
        Update: {
          analysis_run_id?: string
          created_at?: string
          details?: Json
          id?: string
          interpreted_by?: string | null
          quality_notes?: string | null
          result_confidence?: string | null
          summary?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_results_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_runs: {
        Row: {
          acquired_at: string | null
          created_at: string
          created_by: string | null
          id: string
          instrument_method_id: string
          notes: string | null
          operator: string | null
          run_parameters: Json
          sample_id: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          acquired_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          instrument_method_id: string
          notes?: string | null
          operator?: string | null
          run_parameters?: Json
          sample_id: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          acquired_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          instrument_method_id?: string
          notes?: string | null
          operator?: string | null
          run_parameters?: Json
          sample_id?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_instrument_method_id_fkey"
            columns: ["instrument_method_id"]
            isOneToOne: false
            referencedRelation: "instrument_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_condition_programs: {
        Row: {
          agitation: string | null
          atmosphere: string | null
          batch_id: string
          created_at: string
          created_by: string | null
          cycle_count: number
          humidity_or_drying_method: string | null
          id: string
          name: string
          notes: string | null
          quantities: Json
          sampling_points: string | null
          template_id: string | null
          vessel: string | null
          workspace_id: string | null
        }
        Insert: {
          agitation?: string | null
          atmosphere?: string | null
          batch_id: string
          created_at?: string
          created_by?: string | null
          cycle_count?: number
          humidity_or_drying_method?: string | null
          id?: string
          name: string
          notes?: string | null
          quantities?: Json
          sampling_points?: string | null
          template_id?: string | null
          vessel?: string | null
          workspace_id?: string | null
        }
        Update: {
          agitation?: string | null
          atmosphere?: string | null
          batch_id?: string
          created_at?: string
          created_by?: string | null
          cycle_count?: number
          humidity_or_drying_method?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantities?: Json
          sampling_points?: string | null
          template_id?: string | null
          vessel?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_condition_programs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_condition_programs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "condition_program_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_condition_programs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          experiment_id: string
          id: string
          label: string
          notes: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          experiment_id: string
          id?: string
          label: string
          notes?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          experiment_id?: string
          id?: string
          label?: string
          notes?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          mentioned_user_id: string
          workspace_id: string | null
        }
        Insert: {
          comment_id: string
          mentioned_user_id: string
          workspace_id?: string | null
        }
        Update: {
          comment_id?: string
          mentioned_user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          target_id: string
          target_type: string
          workspace_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          target_id: string
          target_type: string
          workspace_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          target_id?: string
          target_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_program_cycles: {
        Row: {
          batch_condition_program_id: string
          created_at: string
          created_by: string | null
          cycle_index: number
          deviation: Json
          dry_end_at: string | null
          dry_start_at: string | null
          id: string
          observation: string | null
          quantities: Json
          wet_end_at: string | null
          wet_start_at: string | null
          workspace_id: string | null
        }
        Insert: {
          batch_condition_program_id: string
          created_at?: string
          created_by?: string | null
          cycle_index: number
          deviation?: Json
          dry_end_at?: string | null
          dry_start_at?: string | null
          id?: string
          observation?: string | null
          quantities?: Json
          wet_end_at?: string | null
          wet_start_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          batch_condition_program_id?: string
          created_at?: string
          created_by?: string | null
          cycle_index?: number
          deviation?: Json
          dry_end_at?: string | null
          dry_start_at?: string | null
          id?: string
          observation?: string | null
          quantities?: Json
          wet_end_at?: string | null
          wet_start_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "condition_program_cycles_batch_condition_program_id_fkey"
            columns: ["batch_condition_program_id"]
            isOneToOne: false
            referencedRelation: "batch_condition_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_program_cycles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_program_templates: {
        Row: {
          agitation: string | null
          atmosphere: string | null
          created_at: string
          created_by: string | null
          cycle_count: number
          humidity_or_drying_method: string | null
          id: string
          name: string
          notes: string | null
          quantities: Json
          sampling_points: string | null
          vessel: string | null
          workspace_id: string
        }
        Insert: {
          agitation?: string | null
          atmosphere?: string | null
          created_at?: string
          created_by?: string | null
          cycle_count?: number
          humidity_or_drying_method?: string | null
          id?: string
          name: string
          notes?: string | null
          quantities?: Json
          sampling_points?: string | null
          vessel?: string | null
          workspace_id: string
        }
        Update: {
          agitation?: string | null
          atmosphere?: string | null
          created_at?: string
          created_by?: string | null
          cycle_count?: number
          humidity_or_drying_method?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantities?: Json
          sampling_points?: string | null
          vessel?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "condition_program_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      controlled_vocabularies: {
        Row: {
          active: boolean
          sort_order: number
          standard_section: string
          value: string
          vocabulary: string
        }
        Insert: {
          active?: boolean
          sort_order: number
          standard_section: string
          value: string
          vocabulary: string
        }
        Update: {
          active?: boolean
          sort_order?: number
          standard_section?: string
          value?: string
          vocabulary?: string
        }
        Relationships: []
      }
      controls: {
        Row: {
          control_type: string
          created_at: string
          created_by: string | null
          description: string | null
          experiment_id: string
          id: string
          workspace_id: string | null
        }
        Insert: {
          control_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          experiment_id: string
          id?: string
          workspace_id?: string | null
        }
        Update: {
          control_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          experiment_id?: string
          id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "controls_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      environmental_conditions: {
        Row: {
          anaerobic: boolean | null
          atmosphere_gas: string | null
          batch_id: string
          buffer_identity: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          final_ph: number | null
          freeze_thaw_cycles: number | null
          heating_method: string | null
          id: string
          initial_ph: number | null
          ionic_strength: string | null
          light_uv_exposure: string | null
          light_uv_wavelength: number | null
          mineral_surface_type: string | null
          notes: string | null
          pressure: string | null
          quantities: Json
          vessel_material: string | null
          water_activity: number | null
          workspace_id: string | null
        }
        Insert: {
          anaerobic?: boolean | null
          atmosphere_gas?: string | null
          batch_id: string
          buffer_identity?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          final_ph?: number | null
          freeze_thaw_cycles?: number | null
          heating_method?: string | null
          id?: string
          initial_ph?: number | null
          ionic_strength?: string | null
          light_uv_exposure?: string | null
          light_uv_wavelength?: number | null
          mineral_surface_type?: string | null
          notes?: string | null
          pressure?: string | null
          quantities?: Json
          vessel_material?: string | null
          water_activity?: number | null
          workspace_id?: string | null
        }
        Update: {
          anaerobic?: boolean | null
          atmosphere_gas?: string | null
          batch_id?: string
          buffer_identity?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          final_ph?: number | null
          freeze_thaw_cycles?: number | null
          heating_method?: string | null
          id?: string
          initial_ph?: number | null
          ionic_strength?: string | null
          light_uv_exposure?: string | null
          light_uv_wavelength?: number | null
          mineral_surface_type?: string | null
          notes?: string | null
          pressure?: string | null
          quantities?: Json
          vessel_material?: string | null
          water_activity?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "environmental_conditions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "environmental_conditions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_chunks: {
        Row: {
          attempts: number
          content: string
          content_hash: string
          created_at: string
          embedding: string | null
          embedding_dimensions: number | null
          embedding_model: string | null
          embedding_version: number
          id: string
          indexed_at: string | null
          last_error: string | null
          metadata: Json
          next_attempt_at: string
          section_type: string
          source_id: string
          source_type: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          content: string
          content_hash: string
          created_at?: string
          embedding?: string | null
          embedding_dimensions?: number | null
          embedding_model?: string | null
          embedding_version?: number
          id?: string
          indexed_at?: string | null
          last_error?: string | null
          metadata?: Json
          next_attempt_at?: string
          section_type: string
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          content?: string
          content_hash?: string
          created_at?: string
          embedding?: string | null
          embedding_dimensions?: number | null
          embedding_model?: string | null
          embedding_version?: number
          id?: string
          indexed_at?: string | null
          last_error?: string | null
          metadata?: Json
          next_attempt_at?: string
          section_type?: string
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_drafts: {
        Row: {
          base_updated_at: string | null
          client_draft_id: string | null
          created_at: string
          fields: Json
          id: string
          owner_id: string
          raw_note: string | null
          target_experiment_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_updated_at?: string | null
          client_draft_id?: string | null
          created_at?: string
          fields?: Json
          id?: string
          owner_id: string
          raw_note?: string | null
          target_experiment_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_updated_at?: string | null
          client_draft_id?: string | null
          created_at?: string
          fields?: Json
          id?: string
          owner_id?: string
          raw_note?: string | null
          target_experiment_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_drafts_target_experiment_id_fkey"
            columns: ["target_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          experiment_id: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          experiment_id?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_embeddings_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: true
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_embeddings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_files: {
        Row: {
          acquisition_timestamp: string | null
          analysis_run_id: string | null
          byte_size: number | null
          created_at: string | null
          current_version_id: string | null
          experiment_id: string | null
          experiment_step_id: string | null
          file_role: string | null
          file_type: string | null
          id: string
          kind: string | null
          label: string | null
          mime_type: string | null
          parsed_metadata: Json
          retention_state: string
          sha256: string | null
          source_instrument: string | null
          storage_path: string | null
          uploaded_by: string | null
          url: string | null
          workspace_id: string | null
        }
        Insert: {
          acquisition_timestamp?: string | null
          analysis_run_id?: string | null
          byte_size?: number | null
          created_at?: string | null
          current_version_id?: string | null
          experiment_id?: string | null
          experiment_step_id?: string | null
          file_role?: string | null
          file_type?: string | null
          id?: string
          kind?: string | null
          label?: string | null
          mime_type?: string | null
          parsed_metadata?: Json
          retention_state?: string
          sha256?: string | null
          source_instrument?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
          workspace_id?: string | null
        }
        Update: {
          acquisition_timestamp?: string | null
          analysis_run_id?: string | null
          byte_size?: number | null
          created_at?: string | null
          current_version_id?: string | null
          experiment_id?: string | null
          experiment_step_id?: string | null
          file_role?: string | null
          file_type?: string | null
          id?: string
          kind?: string | null
          label?: string | null
          mime_type?: string | null
          parsed_metadata?: Json
          retention_state?: string
          sha256?: string | null
          source_instrument?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_files_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_files_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "file_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_files_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_files_experiment_step_id_fkey"
            columns: ["experiment_step_id"]
            isOneToOne: false
            referencedRelation: "experiment_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_inputs: {
        Row: {
          calculation: Json
          created_at: string
          created_by: string | null
          equivalents: number | null
          experiment_id: string
          id: string
          is_limiting_reagent: boolean
          moles: number | null
          notes: string | null
          quantities: Json
          role: string
          source_id: string
          source_type: string
          workspace_id: string | null
        }
        Insert: {
          calculation?: Json
          created_at?: string
          created_by?: string | null
          equivalents?: number | null
          experiment_id: string
          id?: string
          is_limiting_reagent?: boolean
          moles?: number | null
          notes?: string | null
          quantities?: Json
          role: string
          source_id: string
          source_type: string
          workspace_id?: string | null
        }
        Update: {
          calculation?: Json
          created_at?: string
          created_by?: string | null
          equivalents?: number | null
          experiment_id?: string
          id?: string
          is_limiting_reagent?: boolean
          moles?: number | null
          notes?: string | null
          quantities?: Json
          role?: string
          source_id?: string
          source_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_inputs_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_inputs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_lock_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          experiment_id: string
          id: string
          reason: string
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          experiment_id: string
          id?: string
          reason: string
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          experiment_id?: string
          id?: string
          reason?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_lock_events_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_lock_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_outputs: {
        Row: {
          calculation: Json
          created_at: string
          created_by: string | null
          experiment_id: string
          id: string
          material_id: string | null
          material_name: string | null
          notes: string | null
          percent_yield: number | null
          quantities: Json
          role: string
          theoretical_yield_mass: number | null
          workspace_id: string | null
        }
        Insert: {
          calculation?: Json
          created_at?: string
          created_by?: string | null
          experiment_id: string
          id?: string
          material_id?: string | null
          material_name?: string | null
          notes?: string | null
          percent_yield?: number | null
          quantities?: Json
          role?: string
          theoretical_yield_mass?: number | null
          workspace_id?: string | null
        }
        Update: {
          calculation?: Json
          created_at?: string
          created_by?: string | null
          experiment_id?: string
          id?: string
          material_id?: string | null
          material_name?: string | null
          notes?: string | null
          percent_yield?: number | null
          quantities?: Json
          role?: string
          theoretical_yield_mass?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_outputs_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_outputs_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_outputs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          relationship_type: string
          source_experiment_id: string
          target_experiment_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          relationship_type: string
          source_experiment_id: string
          target_experiment_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          relationship_type?: string
          source_experiment_id?: string
          target_experiment_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_relationships_source_experiment_id_fkey"
            columns: ["source_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_relationships_target_experiment_id_fkey"
            columns: ["target_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_relationships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          editor_id?: string | null
          experiment_id?: string | null
          id?: string
          snapshot: Json
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          editor_id?: string | null
          experiment_id?: string | null
          id?: string
          snapshot?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_revisions_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_series: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_series_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_series_members: {
        Row: {
          added_at: string
          experiment_id: string
          series_id: string
          workspace_id: string | null
        }
        Insert: {
          added_at?: string
          experiment_id: string
          series_id: string
          workspace_id?: string | null
        }
        Update: {
          added_at?: string
          experiment_id?: string
          series_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_series_members_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_series_members_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "experiment_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_series_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_steps: {
        Row: {
          actual_atmosphere: string | null
          actual_ph: number | null
          actual_quantities: Json
          completed_at: string | null
          completed_by: string | null
          experiment_id: string
          id: string
          protocol_step_id: string
          started_at: string | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          actual_atmosphere?: string | null
          actual_ph?: number | null
          actual_quantities?: Json
          completed_at?: string | null
          completed_by?: string | null
          experiment_id: string
          id?: string
          protocol_step_id: string
          started_at?: string | null
          status?: string
          workspace_id?: string | null
        }
        Update: {
          actual_atmosphere?: string | null
          actual_ph?: number | null
          actual_quantities?: Json
          completed_at?: string | null
          completed_by?: string | null
          experiment_id?: string
          id?: string
          protocol_step_id?: string
          started_at?: string | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_steps_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_steps_protocol_step_id_fkey"
            columns: ["protocol_step_id"]
            isOneToOne: false
            referencedRelation: "protocol_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_tasks: {
        Row: {
          assignee_id: string | null
          blocker_note: string | null
          checklist: Json | null
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          status: string
          target_id: string
          target_type: string
          task_type: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          blocker_note?: string | null
          checklist?: Json | null
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          status?: string
          target_id: string
          target_type: string
          task_type: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          blocker_note?: string | null
          checklist?: Json | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          status?: string
          target_id?: string
          target_type?: string
          task_type?: string
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          defaults: Json
          frozen_at: string | null
          id: string
          required_fields: string[]
          template_id: string
          version: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          defaults?: Json
          frozen_at?: string | null
          id?: string
          required_fields?: string[]
          template_id: string
          version: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          defaults?: Json
          frozen_at?: string | null
          id?: string
          required_fields?: string[]
          template_id?: string
          version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "experiment_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_template_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_templates: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          acceptance_criteria: string | null
          acceptance_criteria_locked_at: string | null
          based_on_experiment_id: string | null
          completed_at: string | null
          completed_by: string | null
          compounds: string[] | null
          concentration: string | null
          conclusion: string | null
          controlled_variables: string | null
          controls: Json
          created_at: string | null
          cycles: number | null
          data_analysis_plan: string | null
          date: string | null
          deleted_at: string | null
          hypothesis: string | null
          id: string
          independent_variables: string | null
          locked_at: string | null
          metals: string[] | null
          methods: string[] | null
          mz: number[] | null
          name: string
          next_steps: string | null
          notes: string | null
          observations: string | null
          owner_id: string | null
          ph: number | null
          planned_analyses: string | null
          planned_end_at: string | null
          planned_start_at: string | null
          primary_outcome: string | null
          project: string | null
          protocol_version: string | null
          protocol_version_id: string | null
          quantities: Json
          rationale: string | null
          reaction_type: string | null
          researcher: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risks_failure_modes: string | null
          sample_matrix: Json
          sample_storage_plan: string | null
          scientific_question: string | null
          search_vector: unknown
          secondary_outcomes: string | null
          short_code: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["experiment_status"] | null
          temperature: string | null
          template_version_id: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          acceptance_criteria?: string | null
          acceptance_criteria_locked_at?: string | null
          based_on_experiment_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          compounds?: string[] | null
          concentration?: string | null
          conclusion?: string | null
          controlled_variables?: string | null
          controls?: Json
          created_at?: string | null
          cycles?: number | null
          data_analysis_plan?: string | null
          date?: string | null
          deleted_at?: string | null
          hypothesis?: string | null
          id: string
          independent_variables?: string | null
          locked_at?: string | null
          metals?: string[] | null
          methods?: string[] | null
          mz?: number[] | null
          name: string
          next_steps?: string | null
          notes?: string | null
          observations?: string | null
          owner_id?: string | null
          ph?: number | null
          planned_analyses?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          primary_outcome?: string | null
          project?: string | null
          protocol_version?: string | null
          protocol_version_id?: string | null
          quantities?: Json
          rationale?: string | null
          reaction_type?: string | null
          researcher?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risks_failure_modes?: string | null
          sample_matrix?: Json
          sample_storage_plan?: string | null
          scientific_question?: string | null
          search_vector?: unknown
          secondary_outcomes?: string | null
          short_code?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"] | null
          temperature?: string | null
          template_version_id?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          acceptance_criteria?: string | null
          acceptance_criteria_locked_at?: string | null
          based_on_experiment_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          compounds?: string[] | null
          concentration?: string | null
          conclusion?: string | null
          controlled_variables?: string | null
          controls?: Json
          created_at?: string | null
          cycles?: number | null
          data_analysis_plan?: string | null
          date?: string | null
          deleted_at?: string | null
          hypothesis?: string | null
          id?: string
          independent_variables?: string | null
          locked_at?: string | null
          metals?: string[] | null
          methods?: string[] | null
          mz?: number[] | null
          name?: string
          next_steps?: string | null
          notes?: string | null
          observations?: string | null
          owner_id?: string | null
          ph?: number | null
          planned_analyses?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          primary_outcome?: string | null
          project?: string | null
          protocol_version?: string | null
          protocol_version_id?: string | null
          quantities?: Json
          rationale?: string | null
          reaction_type?: string | null
          researcher?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risks_failure_modes?: string | null
          sample_matrix?: Json
          sample_storage_plan?: string | null
          scientific_question?: string | null
          search_vector?: unknown
          secondary_outcomes?: string | null
          short_code?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"] | null
          temperature?: string | null
          template_version_id?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiments_based_on_experiment_id_fkey"
            columns: ["based_on_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_project_fkey"
            columns: ["project"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_protocol_version_id_fkey"
            columns: ["protocol_version_id"]
            isOneToOne: false
            referencedRelation: "protocol_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_template_version_fk"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "experiment_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      file_jobs: {
        Row: {
          attempts: number
          created_at: string
          file_version_id: string
          id: string
          job_type: string
          last_error: string | null
          next_attempt_at: string
          result: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          file_version_id: string
          id?: string
          job_type: string
          last_error?: string | null
          next_attempt_at?: string
          result?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          file_version_id?: string
          id?: string
          job_type?: string
          last_error?: string | null
          next_attempt_at?: string
          result?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_jobs_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: false
            referencedRelation: "file_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      file_versions: {
        Row: {
          byte_size: number | null
          created_at: string
          experiment_file_id: string
          id: string
          mime_type: string | null
          original_filename: string | null
          processing_state: string
          sha256: string | null
          storage_path: string
          uploaded_by: string | null
          version_number: number
          workspace_id: string | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          experiment_file_id: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          processing_state?: string
          sha256?: string | null
          storage_path: string
          uploaded_by?: string | null
          version_number: number
          workspace_id?: string | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          experiment_file_id?: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          processing_state?: string
          sha256?: string | null
          storage_path?: string
          uploaded_by?: string | null
          version_number?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_experiment_file_id_fkey"
            columns: ["experiment_file_id"]
            isOneToOne: false
            referencedRelation: "experiment_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      instrument_methods: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          method_type: string
          name: string
          notes: string | null
          parameters: Json
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          method_type: string
          name: string
          notes?: string | null
          parameters?: Json
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          method_type?: string
          name?: string
          notes?: string | null
          parameters?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instrument_methods_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_methods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          model: string | null
          name: string
          notes: string | null
          serial_number: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          model?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instruments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      material_identifiers: {
        Row: {
          created_at: string
          id: string
          identifier_type: string
          is_primary: boolean
          material_id: string
          value: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identifier_type: string
          is_primary?: boolean
          material_id: string
          value: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identifier_type?: string
          is_primary?: boolean
          material_id?: string
          value?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_identifiers_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_identifiers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      material_lots: {
        Row: {
          catalog_number: string | null
          commercial_solution_quantities: Json
          concentration_basis: string | null
          created_at: string
          created_by: string | null
          date_opened: string | null
          density: number | null
          density_temperature: number | null
          expiration_or_retest_date: string | null
          id: string
          lot_number: string | null
          material_id: string
          physical_form: string | null
          purity: number | null
          storage_location_id: string | null
          supplier: string | null
          updated_at: string
          water_content_or_hydrate_form: string | null
          workspace_id: string | null
        }
        Insert: {
          catalog_number?: string | null
          commercial_solution_quantities?: Json
          concentration_basis?: string | null
          created_at?: string
          created_by?: string | null
          date_opened?: string | null
          density?: number | null
          density_temperature?: number | null
          expiration_or_retest_date?: string | null
          id?: string
          lot_number?: string | null
          material_id: string
          physical_form?: string | null
          purity?: number | null
          storage_location_id?: string | null
          supplier?: string | null
          updated_at?: string
          water_content_or_hydrate_form?: string | null
          workspace_id?: string | null
        }
        Update: {
          catalog_number?: string | null
          commercial_solution_quantities?: Json
          concentration_basis?: string | null
          created_at?: string
          created_by?: string | null
          date_opened?: string | null
          density?: number | null
          density_temperature?: number | null
          expiration_or_retest_date?: string | null
          id?: string
          lot_number?: string | null
          material_id?: string
          physical_form?: string | null
          purity?: number | null
          storage_location_id?: string | null
          supplier?: string | null
          updated_at?: string
          water_content_or_hydrate_form?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_lots_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_lots_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_lots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          created_by: string | null
          exact_mass: number | null
          formula: string | null
          id: string
          molecular_weight: number | null
          preferred_name: string
          safety_notes: string | null
          short_code: string | null
          stereochemistry: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exact_mass?: number | null
          formula?: string | null
          id?: string
          molecular_weight?: number | null
          preferred_name: string
          safety_notes?: string | null
          short_code?: string | null
          stereochemistry?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exact_mass?: number | null
          formula?: string | null
          id?: string
          molecular_weight?: number | null
          preferred_name?: string
          safety_notes?: string | null
          short_code?: string | null
          stereochemistry?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          task_id: string | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          task_id?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "experiment_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      peak_assignments: {
        Row: {
          adduct: string | null
          analysis_result_id: string
          assignment: string | null
          charge: number | null
          confidence: string | null
          created_at: string
          expected_mz: number | null
          formula_candidate: string | null
          id: string
          intensity: number | null
          ion_mode: string | null
          linked_file_id: string | null
          ms_level: number | null
          notes: string | null
          observed_mz: number | null
          ppm_error: number | null
          retention_time_min: number | null
          workspace_id: string | null
        }
        Insert: {
          adduct?: string | null
          analysis_result_id: string
          assignment?: string | null
          charge?: number | null
          confidence?: string | null
          created_at?: string
          expected_mz?: number | null
          formula_candidate?: string | null
          id?: string
          intensity?: number | null
          ion_mode?: string | null
          linked_file_id?: string | null
          ms_level?: number | null
          notes?: string | null
          observed_mz?: number | null
          ppm_error?: number | null
          retention_time_min?: number | null
          workspace_id?: string | null
        }
        Update: {
          adduct?: string | null
          analysis_result_id?: string
          assignment?: string | null
          charge?: number | null
          confidence?: string | null
          created_at?: string
          expected_mz?: number | null
          formula_candidate?: string | null
          id?: string
          intensity?: number | null
          ion_mode?: string | null
          linked_file_id?: string | null
          ms_level?: number | null
          notes?: string | null
          observed_mz?: number | null
          ppm_error?: number | null
          retention_time_min?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peak_assignments_analysis_result_id_fkey"
            columns: ["analysis_result_id"]
            isOneToOne: false
            referencedRelation: "analysis_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peak_assignments_linked_file_id_fkey"
            columns: ["linked_file_id"]
            isOneToOne: false
            referencedRelation: "analysis_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peak_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      project_members: {
        Row: {
          project_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
        }
        Insert: {
          project_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
        }
        Update: {
          project_id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string | null
          id: string
          label: string
          owner_id: string | null
          workspace_id: string
        }
        Insert: {
          color?: string | null
          id: string
          label: string
          owner_id?: string | null
          workspace_id: string
        }
        Update: {
          color?: string | null
          id?: string
          label?: string
          owner_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          id: string
          prompt_key: string
          updated_at: string
          version: number
        }
        Insert: {
          id?: string
          prompt_key: string
          updated_at?: string
          version?: number
        }
        Update: {
          id?: string
          prompt_key?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      protocol_steps: {
        Row: {
          id: string
          instruction: string
          protocol_version_id: string
          required_material: string | null
          safety_note: string | null
          step_number: number
          target_atmosphere: string | null
          target_ph: number | null
          target_quantities: Json
          workspace_id: string | null
        }
        Insert: {
          id?: string
          instruction: string
          protocol_version_id: string
          required_material?: string | null
          safety_note?: string | null
          step_number: number
          target_atmosphere?: string | null
          target_ph?: number | null
          target_quantities?: Json
          workspace_id?: string | null
        }
        Update: {
          id?: string
          instruction?: string
          protocol_version_id?: string
          required_material?: string | null
          safety_note?: string | null
          step_number?: number
          target_atmosphere?: string | null
          target_ph?: number | null
          target_quantities?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_steps_protocol_version_id_fkey"
            columns: ["protocol_version_id"]
            isOneToOne: false
            referencedRelation: "protocol_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_versions: {
        Row: {
          created_at: string
          created_by: string | null
          critical_parameters: Json
          equipment: string | null
          frozen_at: string | null
          id: string
          known_failure_modes: Json
          protocol_id: string
          purpose: string | null
          qc_checks: string | null
          required_materials: string | null
          safety_notes: string | null
          scope: string | null
          version: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          critical_parameters?: Json
          equipment?: string | null
          frozen_at?: string | null
          id?: string
          known_failure_modes?: Json
          protocol_id: string
          purpose?: string | null
          qc_checks?: string | null
          required_materials?: string | null
          safety_notes?: string | null
          scope?: string | null
          version: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          critical_parameters?: Json
          equipment?: string | null
          frozen_at?: string | null
          id?: string
          known_failure_modes?: Json
          protocol_id?: string
          purpose?: string | null
          qc_checks?: string | null
          required_materials?: string | null
          safety_notes?: string | null
          scope?: string | null
          version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_versions_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      protocols: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocols_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quantity_kinds: {
        Row: {
          active: boolean
          canonical_unit_code: string
          category: string
          compatible_units: string[]
          key: string
          label: string
          sort_order: number
          standard_field_name: string
        }
        Insert: {
          active?: boolean
          canonical_unit_code: string
          category: string
          compatible_units: string[]
          key: string
          label: string
          sort_order: number
          standard_field_name: string
        }
        Update: {
          active?: boolean
          canonical_unit_code?: string
          category?: string
          compatible_units?: string[]
          key?: string
          label?: string
          sort_order?: number
          standard_field_name?: string
        }
        Relationships: []
      }
      sample_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          note: string | null
          sample_id: string
          workspace_id: string | null
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          note?: string | null
          sample_id: string
          workspace_id?: string | null
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          note?: string | null
          sample_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_aliases_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_aliases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_events: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: string
          occurred_at: string
          performed_by: string | null
          sample_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          occurred_at?: string
          performed_by?: string | null
          sample_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          performed_by?: string | null
          sample_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_events_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_locations: {
        Row: {
          location_path: string | null
          sample_id: string
          status: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          location_path?: string | null
          sample_id: string
          status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          location_path?: string | null
          sample_id?: string
          status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_locations_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: true
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_locations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_measurements: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          measured_by: string | null
          notes: string | null
          quantities: Json
          sample_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          measured_by?: string | null
          notes?: string | null
          quantities?: Json
          sample_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          measured_by?: string | null
          notes?: string | null
          quantities?: Json
          sample_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_measurements_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_measurements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          relationship_type: string
          source_sample_id: string
          target_sample_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          relationship_type: string
          source_sample_id: string
          target_sample_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          relationship_type?: string
          source_sample_id?: string
          target_sample_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_relationships_source_sample_id_fkey"
            columns: ["source_sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_relationships_target_sample_id_fkey"
            columns: ["target_sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_relationships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          legacy_code: string | null
          notes: string | null
          origin_id: string | null
          origin_type: string | null
          reaction_mode: string | null
          replicate: number
          sample_type: string | null
          status: string
          updated_at: string
          vial_label: string
          workspace_id: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_code?: string | null
          notes?: string | null
          origin_id?: string | null
          origin_type?: string | null
          reaction_mode?: string | null
          replicate?: number
          sample_type?: string | null
          status?: string
          updated_at?: string
          vial_label: string
          workspace_id?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_code?: string | null
          notes?: string | null
          origin_id?: string | null
          origin_type?: string | null
          reaction_mode?: string | null
          replicate?: number
          sample_type?: string | null
          status?: string
          updated_at?: string
          vial_label?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          query: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          query: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          query?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      step_deviations: {
        Row: {
          affected_samples: string | null
          category: string
          corrective_action: string | null
          decision_owner: string | null
          experiment_step_id: string
          how_discovered: string | null
          id: string
          likely_impact: string | null
          linked_replacement_sample: string | null
          preventive_action: string | null
          reported_at: string
          reported_by: string | null
          sample_still_usable: boolean | null
          what_happened: string
          workspace_id: string | null
        }
        Insert: {
          affected_samples?: string | null
          category: string
          corrective_action?: string | null
          decision_owner?: string | null
          experiment_step_id: string
          how_discovered?: string | null
          id?: string
          likely_impact?: string | null
          linked_replacement_sample?: string | null
          preventive_action?: string | null
          reported_at?: string
          reported_by?: string | null
          sample_still_usable?: boolean | null
          what_happened: string
          workspace_id?: string | null
        }
        Update: {
          affected_samples?: string | null
          category?: string
          corrective_action?: string | null
          decision_owner?: string | null
          experiment_step_id?: string
          how_discovered?: string | null
          id?: string
          likely_impact?: string | null
          linked_replacement_sample?: string | null
          preventive_action?: string | null
          reported_at?: string
          reported_by?: string | null
          sample_still_usable?: boolean | null
          what_happened?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_deviations_experiment_step_id_fkey"
            columns: ["experiment_step_id"]
            isOneToOne: false
            referencedRelation: "experiment_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_deviations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      step_observations: {
        Row: {
          experiment_step_id: string
          id: string
          note: string
          observed_at: string
          observed_by: string | null
          workspace_id: string | null
        }
        Insert: {
          experiment_step_id: string
          id?: string
          note: string
          observed_at?: string
          observed_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          experiment_step_id?: string
          id?: string
          note?: string
          observed_at?: string
          observed_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_observations_experiment_step_id_fkey"
            columns: ["experiment_step_id"]
            isOneToOne: false
            referencedRelation: "experiment_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_observations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_solubility_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          attempted_by: string | null
          id: string
          notes: string | null
          outcome: string
          solvent: string | null
          stock_solution_id: string
          target_quantities: Json
          workspace_id: string | null
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          attempted_by?: string | null
          id?: string
          notes?: string | null
          outcome: string
          solvent?: string | null
          stock_solution_id: string
          target_quantities?: Json
          workspace_id?: string | null
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          attempted_by?: string | null
          id?: string
          notes?: string | null
          outcome?: string
          solvent?: string | null
          stock_solution_id?: string
          target_quantities?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_solubility_attempts_stock_solution_id_fkey"
            columns: ["stock_solution_id"]
            isOneToOne: false
            referencedRelation: "stock_solutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_solubility_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_solutions: {
        Row: {
          acid_or_base_added: string | null
          acid_or_base_quantities: Json
          actual_quantities: Json
          calculation: Json
          color_and_appearance: string | null
          created_at: string
          expiration_or_review_date: string | null
          filtration_or_centrifugation: string | null
          freeze_thaw_count: number
          id: string
          material_lot_id: string
          ph_measured: number | null
          ph_target: number | null
          prepared_at: string | null
          prepared_by: string | null
          solubility_status: string | null
          solvent: string | null
          solvent_grade: string | null
          storage_location_id: string | null
          storage_temperature: number | null
          target_quantities: Json
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          workspace_id: string | null
        }
        Insert: {
          acid_or_base_added?: string | null
          acid_or_base_quantities?: Json
          actual_quantities?: Json
          calculation?: Json
          color_and_appearance?: string | null
          created_at?: string
          expiration_or_review_date?: string | null
          filtration_or_centrifugation?: string | null
          freeze_thaw_count?: number
          id?: string
          material_lot_id: string
          ph_measured?: number | null
          ph_target?: number | null
          prepared_at?: string | null
          prepared_by?: string | null
          solubility_status?: string | null
          solvent?: string | null
          solvent_grade?: string | null
          storage_location_id?: string | null
          storage_temperature?: number | null
          target_quantities?: Json
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          acid_or_base_added?: string | null
          acid_or_base_quantities?: Json
          actual_quantities?: Json
          calculation?: Json
          color_and_appearance?: string | null
          created_at?: string
          expiration_or_review_date?: string | null
          filtration_or_centrifugation?: string | null
          freeze_thaw_count?: number
          id?: string
          material_lot_id?: string
          ph_measured?: number | null
          ph_target?: number | null
          prepared_at?: string | null
          prepared_by?: string | null
          solubility_status?: string | null
          solvent?: string | null
          solvent_grade?: string | null
          storage_location_id?: string | null
          storage_temperature?: number | null
          target_quantities?: Json
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_solutions_material_lot_id_fkey"
            columns: ["material_lot_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_solutions_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_solutions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          conditions: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          workspace_id: string
        }
        Insert: {
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          workspace_id: string
        }
        Update: {
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          joined_at?: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_experiment: {
        Args: { p_ended_as?: string; p_id: string }
        Returns: undefined
      }
      effective_role: {
        Args: { proj_id: string; uid: string; ws_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
      is_workspace_admin: {
        Args: { uid: string; ws_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { uid: string; ws_id: string }
        Returns: boolean
      }
      is_workspace_writer: {
        Args: { uid: string; ws_id: string }
        Returns: boolean
      }
      match_evidence_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          id: string
          metadata: Json
          section_type: string
          similarity: number
          source_id: string
          source_type: string
        }[]
      }
      match_experiments: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          id: string
          name: string
          similarity: number
        }[]
      }
      next_experiment_id: { Args: never; Returns: string }
      next_protocol_id: { Args: never; Returns: string }
      reopen_experiment: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      upsert_evidence_chunk: {
        Args: {
          p_content: string
          p_metadata: Json
          p_section_type: string
          p_source_id: string
          p_source_type: string
          p_workspace_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      experiment_status:
        | "draft"
        | "planned"
        | "in_progress"
        | "paused"
        | "completed"
        | "reviewed"
        | "archived"
        | "failed"
        | "cancelled"
      workspace_role:
        | "owner"
        | "admin"
        | "pi"
        | "researcher"
        | "student"
        | "viewer"
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
    Enums: {
      experiment_status: [
        "draft",
        "planned",
        "in_progress",
        "paused",
        "completed",
        "reviewed",
        "archived",
        "failed",
        "cancelled",
      ],
      workspace_role: [
        "owner",
        "admin",
        "pi",
        "researcher",
        "student",
        "viewer",
      ],
    },
  },
} as const
