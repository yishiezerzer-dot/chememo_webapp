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
      experiment_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          relationship_type: string
          source_experiment_id: string
          target_experiment_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          relationship_type: string
          source_experiment_id: string
          target_experiment_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          relationship_type?: string
          source_experiment_id?: string
          target_experiment_id?: string
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
        ]
      }
      experiment_series: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      experiment_series_members: {
        Row: {
          added_at: string
          experiment_id: string
          series_id: string
        }
        Insert: {
          added_at?: string
          experiment_id: string
          series_id: string
        }
        Update: {
          added_at?: string
          experiment_id?: string
          series_id?: string
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
        }
        Relationships: []
      }
      comment_mentions: {
        Row: {
          comment_id: string
          mentioned_user_id: string
        }
        Insert: {
          comment_id: string
          mentioned_user_id: string
        }
        Update: {
          comment_id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
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
        }
        Relationships: []
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
      saved_views: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          query: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          query: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          query?: Json
        }
        Relationships: []
      }
      protocols: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
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
        }
        Relationships: [
          {
            foreignKeyName: "protocol_versions_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
        ]
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
        }
        Relationships: [
          {
            foreignKeyName: "protocol_steps_protocol_version_id_fkey"
            columns: ["protocol_version_id"]
            isOneToOne: false
            referencedRelation: "protocol_versions"
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
        ]
      }
      step_observations: {
        Row: {
          experiment_step_id: string
          id: string
          note: string
          observed_at: string
          observed_by: string | null
        }
        Insert: {
          experiment_step_id: string
          id?: string
          note: string
          observed_at?: string
          observed_by?: string | null
        }
        Update: {
          experiment_step_id?: string
          id?: string
          note?: string
          observed_at?: string
          observed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_observations_experiment_step_id_fkey"
            columns: ["experiment_step_id"]
            isOneToOne: false
            referencedRelation: "experiment_steps"
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
        }
        Relationships: [
          {
            foreignKeyName: "step_deviations_experiment_step_id_fkey"
            columns: ["experiment_step_id"]
            isOneToOne: false
            referencedRelation: "experiment_steps"
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
          experiment_step_id: string | null
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
          experiment_step_id?: string | null
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
          experiment_step_id?: string | null
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
          {
            foreignKeyName: "experiment_files_experiment_step_id_fkey"
            columns: ["experiment_step_id"]
            isOneToOne: false
            referencedRelation: "experiment_steps"
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
        }
        Relationships: [
          {
            foreignKeyName: "experiment_drafts_target_experiment_id_fkey"
            columns: ["target_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
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
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          experiment_id: string
          id?: string
          reason: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          experiment_id?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_lock_events_experiment_id_fkey"
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
          search_vector: string | null
          secondary_outcomes: string | null
          short_code: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["experiment_status"] | null
          template_version_id: string | null
          temperature: string | null
          updated_at: string | null
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
          secondary_outcomes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"] | null
          template_version_id?: string | null
          temperature?: string | null
          updated_at?: string | null
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
          secondary_outcomes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"] | null
          template_version_id?: string | null
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
          {
            foreignKeyName: "experiments_based_on_experiment_id_fkey"
            columns: ["based_on_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
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
            foreignKeyName: "experiments_protocol_version_fk"
            columns: ["protocol_version_id"]
            isOneToOne: false
            referencedRelation: "protocol_versions"
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
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
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
        }
        Relationships: [
          {
            foreignKeyName: "experiment_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "experiment_templates"
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
      archive_experiment: {
        Args: { p_ended_as?: string; p_id: string }
        Returns: undefined
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
      reopen_experiment: {
        Args: { p_id: string; p_reason: string }
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
    },
  },
} as const
