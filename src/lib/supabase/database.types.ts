export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          detail: Json
          event_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          detail?: Json
          event_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          detail?: Json
          event_id?: string | null
          id?: never
        }
        Relationships: []
      }
      division_mobile_links: {
        Row: {
          division_id: string
          league_id: string
          league_name: string
          linked_at: string
          linked_by: string | null
          linked_by_legacy: string | null
          season: string | null
        }
        Insert: {
          division_id: string
          league_id: string
          league_name?: string
          linked_at?: string
          linked_by?: string | null
          linked_by_legacy?: string | null
          season?: string | null
        }
        Update: {
          division_id?: string
          league_id?: string
          league_name?: string
          linked_at?: string
          linked_by?: string | null
          linked_by_legacy?: string | null
          season?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "division_mobile_links_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: true
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "division_mobile_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      division_mobile_team_links: {
        Row: {
          division_id: string
          mobile_team_id: string
          team_id: string
        }
        Insert: {
          division_id: string
          mobile_team_id: string
          team_id: string
        }
        Update: {
          division_id?: string
          mobile_team_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_mobile_team_links_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "division_mobile_links"
            referencedColumns: ["division_id"]
          },
          {
            foreignKeyName: "division_mobile_team_links_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          bracket_count: number
          color: string
          created_at: string
          custom_games_per_team: boolean
          event_id: string
          games_per_team: number | null
          id: string
          legacy_key: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          bracket_count?: number
          color?: string
          created_at?: string
          custom_games_per_team?: boolean
          event_id: string
          games_per_team?: number | null
          id?: string
          legacy_key?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bracket_count?: number
          color?: string
          created_at?: string
          custom_games_per_team?: boolean
          event_id?: string
          games_per_team?: number | null
          id?: string
          legacy_key?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_image_cleanup: {
        Row: {
          created_at: string
          event_id: string
          requested_by: string
        }
        Insert: {
          created_at?: string
          event_id: string
          requested_by: string
        }
        Update: {
          created_at?: string
          event_id?: string
          requested_by?: string
        }
        Relationships: []
      }
      event_sponsors: {
        Row: {
          created_at: string
          event_id: string
          id: string
          image_path: string
          sort_order: number
          tier: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          image_path: string
          sort_order?: number
          tier: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          image_path?: string
          sort_order?: number
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sponsors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          court_names: string[]
          courts: number
          created_at: string
          id: string
          legacy_created_by: string | null
          legacy_firebase_id: string | null
          logo_path: string | null
          name: string
          owner_id: string
          published_at: string | null
          rules_html: string
          schedule_days: string[]
          status: string
          theme_bg: string
          theme_heading: string
          theme_primary: string
          theme_text: string
          theme_text_secondary: string
          time_end: string
          time_start: string
          timezone: string
          updated_at: string
        }
        Insert: {
          court_names?: string[]
          courts?: number
          created_at?: string
          id?: string
          legacy_created_by?: string | null
          legacy_firebase_id?: string | null
          logo_path?: string | null
          name?: string
          owner_id: string
          published_at?: string | null
          rules_html?: string
          schedule_days?: string[]
          status?: string
          theme_bg?: string
          theme_heading?: string
          theme_primary?: string
          theme_text?: string
          theme_text_secondary?: string
          time_end?: string
          time_start?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          court_names?: string[]
          courts?: number
          created_at?: string
          id?: string
          legacy_created_by?: string | null
          legacy_firebase_id?: string | null
          logo_path?: string | null
          name?: string
          owner_id?: string
          published_at?: string | null
          rules_html?: string
          schedule_days?: string[]
          status?: string
          theme_bg?: string
          theme_heading?: string
          theme_primary?: string
          theme_text?: string
          theme_text_secondary?: string
          time_end?: string
          time_start?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_scores: {
        Row: {
          event_id: string
          game_id: string
          s1: number | null
          s2: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          event_id: string
          game_id: string
          s1?: number | null
          s2?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          event_id?: string
          game_id?: string
          s1?: number | null
          s2?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_scores_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_scores_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          bracket_game_id: string | null
          court: number | null
          created_at: string
          day: string | null
          division_id: string | null
          event_id: string
          group_id: string | null
          id: string
          is_playoff: boolean
          label: string
          legacy_gid: string | null
          legacy_index: number | null
          legacy_team1: string | null
          legacy_team2: string | null
          playoff_round: number | null
          position: number
          start_time: string | null
          team1_id: string | null
          team1_source: Json | null
          team2_id: string | null
          team2_source: Json | null
          type: string
          updated_at: string
        }
        Insert: {
          bracket_game_id?: string | null
          court?: number | null
          created_at?: string
          day?: string | null
          division_id?: string | null
          event_id: string
          group_id?: string | null
          id?: string
          is_playoff?: boolean
          label?: string
          legacy_gid?: string | null
          legacy_index?: number | null
          legacy_team1?: string | null
          legacy_team2?: string | null
          playoff_round?: number | null
          position?: number
          start_time?: string | null
          team1_id?: string | null
          team1_source?: Json | null
          team2_id?: string | null
          team2_source?: Json | null
          type?: string
          updated_at?: string
        }
        Update: {
          bracket_game_id?: string | null
          court?: number | null
          created_at?: string
          day?: string | null
          division_id?: string | null
          event_id?: string
          group_id?: string | null
          id?: string
          is_playoff?: boolean
          label?: string
          legacy_gid?: string | null
          legacy_index?: number | null
          legacy_team1?: string | null
          legacy_team2?: string | null
          playoff_round?: number | null
          position?: number
          start_time?: string | null
          team1_id?: string | null
          team1_source?: Json | null
          team2_id?: string | null
          team2_source?: Json | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          default_rules_html: string
          id: boolean
          updated_at: string
        }
        Insert: {
          default_rules_html?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          default_rules_html?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_sponsors: {
        Row: {
          created_at: string
          id: string
          image_path: string
          sort_order: number
          tier: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path: string
          sort_order?: number
          tier: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string
          sort_order?: number
          tier?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          created_at: string
          id: string
          mobile_player_id: string | null
          name: string
          number: string
          sort_order: number
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mobile_player_id?: string | null
          name?: string
          number?: string
          sort_order?: number
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mobile_player_id?: string | null
          name?: string
          number?: string
          sort_order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          disabled_at: string | null
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          display_name?: string
          id: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Relationships: []
      }
      score_sources: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_legacy: string | null
          away_pts: number | null
          dismissed_at: string | null
          event_count: number | null
          finished_at: string | null
          game_id: string
          home_pts: number | null
          last_event_at: string | null
          league_id: string | null
          method: string | null
          mobile_game_id: string | null
          s1: number | null
          s2: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_legacy?: string | null
          away_pts?: number | null
          dismissed_at?: string | null
          event_count?: number | null
          finished_at?: string | null
          game_id: string
          home_pts?: number | null
          last_event_at?: string | null
          league_id?: string | null
          method?: string | null
          mobile_game_id?: string | null
          s1?: number | null
          s2?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_legacy?: string | null
          away_pts?: number | null
          dismissed_at?: string | null
          event_count?: number | null
          finished_at?: string | null
          game_id?: string
          home_pts?: number | null
          last_event_at?: string | null
          league_id?: string | null
          method?: string | null
          mobile_game_id?: string | null
          s1?: number | null
          s2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "score_sources_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_sources_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          coach: string
          created_at: string
          division_id: string
          id: string
          legacy_code: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          coach?: string
          created_at?: string
          division_id: string
          id?: string
          legacy_code?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          coach?: string
          created_at?: string
          division_id?: string
          id?: string
          legacy_code?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_games: {
        Args: { p_event_id: string; p_games: Json }
        Returns: number
      }
      approve_mobile_result: {
        Args: { p_game_id: string; p_s1: number; p_s2: number; p_source: Json }
        Returns: undefined
      }
      assert_event_editor: { Args: { p_event_id: string }; Returns: undefined }
      can_read_event: { Args: { p_event_id: string }; Returns: boolean }
      can_write_image_path: { Args: { p_name: string }; Returns: boolean }
      create_draft_event: {
        Args: { p_name: string; p_rules: string; p_timezone: string }
        Returns: string
      }
      dismiss_mobile_result: {
        Args: { p_game_id: string; p_source: Json }
        Returns: undefined
      }
      division_event_id: { Args: { p_division_id: string }; Returns: string }
      game_event_id: { Args: { p_game_id: string }; Returns: string }
      import_mobile_league: {
        Args: {
          p_allow_duplicate?: boolean
          p_division_name: string
          p_event_name: string
          p_league: Json
          p_rules: string
          p_teams: Json
          p_timezone: string
        }
        Returns: string
      }
      insert_games_json_invoker: {
        Args: { p_event_id: string; p_games: Json }
        Returns: number
      }
      is_active_admin: { Args: never; Returns: boolean }
      is_event_editor: { Args: { p_event_id: string }; Returns: boolean }
      is_event_published: { Args: { p_event_id: string }; Returns: boolean }
      is_privileged_role: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      move_game: {
        Args: {
          p_court: number
          p_day: string
          p_game_id: string
          p_start_time: string
        }
        Returns: undefined
      }
      publish_event: {
        Args: { p_clear_scores?: boolean; p_event_id: string; p_games: Json }
        Returns: number
      }
      save_event_editor: {
        Args: {
          p_details: Json
          p_divisions: Json
          p_event_id: string
          p_unschedule?: string[]
          p_version: string
        }
        Returns: string
      }
      set_score: {
        Args: { p_game_id: string; p_s1: number; p_s2: number }
        Returns: undefined
      }
      swap_games: { Args: { p_a: string; p_b: string }; Returns: undefined }
      team_event_id: { Args: { p_team_id: string }; Returns: string }
      try_uuid: { Args: { p: string }; Returns: string }
      unschedule_game: { Args: { p_game_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "superadmin" | "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["superadmin", "admin"],
    },
  },
} as const

