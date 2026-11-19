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
      chapter_boundaries: {
        Row: {
          chapter_label: string | null;
          chapter_number: number;
          created_at: string;
          end_page: number;
          id: string;
          start_page: number;
          user_book_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          chapter_label?: string | null;
          chapter_number: number;
          created_at?: string;
          end_page: number;
          id?: string;
          start_page: number;
          user_book_id: string;
          user_id: string;
        };
        Update: {
          chapter_label?: string | null;
          chapter_number?: number;
          created_at?: string;
          end_page?: number;
          id?: string;
          start_page?: number;
          user_book_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chapter_boundaries_user_book_id_fkey";
            columns: ["user_book_id"];
            isOneToOne: false;
            referencedRelation: "user_books";
            referencedColumns: ["id"];
          },
        ];
      };
      circle_members: {
        Row: {
          circle_id: string;
          joined_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          circle_id: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          circle_id?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey";
            columns: ["circle_id"];
            isOneToOne: false;
            referencedRelation: "reading_circles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_share_invites: {
        Row: {
          access_level: string;
          created_at: string;
          expires_at: string;
          id: string;
          invite_code: string;
          owner_id: string;
          redeemed_at: string | null;
          redeemed_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          access_level: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invite_code: string;
          owner_id: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Update: {
          access_level?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invite_code?: string;
          owner_id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Relationships: [];
      };
      profile_shares: {
        Row: {
          access_level: string;
          created_at: string;
          owner_id: string;
          updated_at: string;
          viewer_id: string;
        };
        ComputedFields: never;
        Insert: {
          access_level: string;
          created_at?: string;
          owner_id: string;
          updated_at?: string;
          viewer_id: string;
        };
        Update: {
          access_level?: string;
          created_at?: string;
          owner_id?: string;
          updated_at?: string;
          viewer_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          tracking_start_date: string;
          tracking_start_goal_minutes: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
          tracking_start_date?: string;
          tracking_start_goal_minutes?: number | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          tracking_start_date?: string;
          tracking_start_goal_minutes?: number | null;
        };
        Relationships: [];
      };
      reading_circles: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          invite_code: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          invite_code?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          invite_code?: string;
        };
        Relationships: [];
      };
      reading_goal_history: {
        Row: {
          changed_at: string;
          effective_date: string;
          target_minutes: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          effective_date: string;
          target_minutes: number;
          user_id: string;
        };
        Update: {
          changed_at?: string;
          effective_date?: string;
          target_minutes?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      reading_goals: {
        Row: {
          books_target: number;
          daily_minutes_target: number;
          user_id: string;
          year: number;
        };
        ComputedFields: never;
        Insert: {
          books_target?: number;
          daily_minutes_target?: number;
          user_id: string;
          year: number;
        };
        Update: {
          books_target?: number;
          daily_minutes_target?: number;
          user_id?: string;
          year?: number;
        };
        Relationships: [];
      };
      reading_sessions: {
        Row: {
          activity_mode: string;
          audio_end_minute: number | null;
          audio_start_minute: number | null;
          chapter_from: number | null;
          chapter_to: number | null;
          created_at: string;
          duration_minutes: number;
          end_page: number | null;
          id: string;
          log_type: string;
          notes: string;
          pages_read: number | null;
          read_number: number;
          session_date: string;
          start_local_time: string | null;
          start_page: number | null;
          user_book_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_mode?: string;
          audio_end_minute?: number | null;
          audio_start_minute?: number | null;
          chapter_from?: number | null;
          chapter_to?: number | null;
          created_at?: string;
          duration_minutes: number;
          end_page?: number | null;
          id?: string;
          log_type: string;
          notes?: string;
          pages_read?: number | null;
          read_number?: number;
          session_date?: string;
          start_local_time?: string | null;
          start_page?: number | null;
          user_book_id: string;
          user_id: string;
        };
        Update: {
          activity_mode?: string;
          audio_end_minute?: number | null;
          audio_start_minute?: number | null;
          chapter_from?: number | null;
          chapter_to?: number | null;
          created_at?: string;
          duration_minutes?: number;
          end_page?: number | null;
          id?: string;
          log_type?: string;
          notes?: string;
          pages_read?: number | null;
          read_number?: number;
          session_date?: string;
          start_local_time?: string | null;
          start_page?: number | null;
          user_book_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reading_sessions_user_book_id_fkey";
            columns: ["user_book_id"];
            isOneToOne: false;
            referencedRelation: "user_books";
            referencedColumns: ["id"];
          },
        ];
      };
      shared_chapter_maps: {
        Row: {
          chapter_data: NonNullable<Json>;
          contributor_id: string;
          created_at: string;
          id: string;
          isbn13: string;
          page_count: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          chapter_data: NonNullable<Json>;
          contributor_id: string;
          created_at?: string;
          id?: string;
          isbn13: string;
          page_count?: number | null;
          updated_at?: string;
        };
        Update: {
          chapter_data?: NonNullable<Json>;
          contributor_id?: string;
          created_at?: string;
          id?: string;
          isbn13?: string;
          page_count?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      shelf_settings: {
        Row: {
          decor: string;
          display_mode: string;
          finish: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          decor?: string;
          display_mode?: string;
          finish?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          decor?: string;
          display_mode?: string;
          finish?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_books: {
        Row: {
          asin: string | null;
          author: string;
          binding: string | null;
          cover_url: string | null;
          created_at: string;
          current_page: number;
          description: string | null;
          edition_key: string | null;
          edition_year: number | null;
          favorite: boolean;
          finished_on: string | null;
          genres: string[];
          goodreads_added_on: string | null;
          height_mm: number | null;
          id: string;
          isbn: string | null;
          notes: string;
          original_published_year: number | null;
          page_count: number | null;
          published_year: number | null;
          publisher: string | null;
          rating: number | null;
          read_history: NonNullable<Json>;
          series_name: string | null;
          series_number: number | null;
          series_source_url: string | null;
          series_total: number | null;
          series_total_source: string | null;
          shelf_order: number;
          started_on: string | null;
          status: string;
          tbr_added_on: string | null;
          thickness_mm: number | null;
          title: string;
          updated_at: string;
          user_id: string;
          work_key: string | null;
        };
        ComputedFields: never;
        Insert: {
          asin?: string | null;
          author?: string;
          binding?: string | null;
          cover_url?: string | null;
          created_at?: string;
          current_page?: number;
          description?: string | null;
          edition_key?: string | null;
          edition_year?: number | null;
          favorite?: boolean;
          finished_on?: string | null;
          genres?: string[];
          goodreads_added_on?: string | null;
          height_mm?: number | null;
          id?: string;
          isbn?: string | null;
          notes?: string;
          original_published_year?: number | null;
          page_count?: number | null;
          published_year?: number | null;
          publisher?: string | null;
          rating?: number | null;
          read_history?: NonNullable<Json>;
          series_name?: string | null;
          series_number?: number | null;
          series_source_url?: string | null;
          series_total?: number | null;
          series_total_source?: string | null;
          shelf_order?: number;
          started_on?: string | null;
          status?: string;
          tbr_added_on?: string | null;
          thickness_mm?: number | null;
          title: string;
          updated_at?: string;
          user_id: string;
          work_key?: string | null;
        };
        Update: {
          asin?: string | null;
          author?: string;
          binding?: string | null;
          cover_url?: string | null;
          created_at?: string;
          current_page?: number;
          description?: string | null;
          edition_key?: string | null;
          edition_year?: number | null;
          favorite?: boolean;
          finished_on?: string | null;
          genres?: string[];
          goodreads_added_on?: string | null;
          height_mm?: number | null;
          id?: string;
          isbn?: string | null;
          notes?: string;
          original_published_year?: number | null;
          page_count?: number | null;
          published_year?: number | null;
          publisher?: string | null;
          rating?: number | null;
          read_history?: NonNullable<Json>;
          series_name?: string | null;
          series_number?: number | null;
          series_source_url?: string | null;
          series_total?: number | null;
          series_total_source?: string | null;
          shelf_order?: number;
          started_on?: string | null;
          status?: string;
          tbr_added_on?: string | null;
          thickness_mm?: number | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          work_key?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_view_full: { Args: { p_owner: string }; Returns: boolean };
      can_view_profile: { Args: { p_owner: string }; Returns: boolean };
      chapter_isbn13: { Args: { p_input: string }; Returns: string };
      create_profile_share_invite: {
        Args: { p_level: string };
        Returns: string;
      };
      create_reading_circle: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_shared_chapter_maps: { Args: { p_isbn13: string }; Returns: Json };
      get_viewable_profile_summaries: {
        Args: { p_year?: number };
        Returns: {
          annual_goal: number;
          audiobook_minutes: number;
          average_rating: number;
          books_finished: number;
          combined_minutes: number;
          display_name: string;
          favorites_count: number;
          owner_id: string;
          reading_minutes: number;
          sessions_count: number;
          total_minutes: number;
          year: number;
        }[];
      };
      in_reading_circle: { Args: { p_circle_id: string }; Returns: boolean };
      join_reading_circle: { Args: { p_invite_code: string }; Returns: string };
      publish_chapter_map: {
        Args: { p_user_book_id: string };
        Returns: string;
      };
      redeem_profile_share_invite: {
        Args: { p_code: string };
        Returns: string;
      };
      replace_book_chapter_map: {
        Args: { p_chapters: Json; p_user_book_id: string };
        Returns: number;
      };
      set_profile_share_level: {
        Args: { p_level: string; p_viewer: string };
        Returns: undefined;
      };
      shares_reading_circle: {
        Args: { p_other_user_id: string };
        Returns: boolean;
      };
      withdraw_chapter_map: {
        Args: { p_user_book_id: string };
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
