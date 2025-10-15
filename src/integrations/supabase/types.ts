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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      amazon_product_config: {
        Row: {
          created_at: string
          door_material: string | null
          door_placement: string | null
          feed_product_type: string
          id: string
          light_placement: string | null
          light_type: string | null
          mirror_folding: boolean | null
          mirror_heated: boolean | null
          mirror_position: string | null
          mirror_turn_signal: boolean | null
          product_id: string
          recommended_browse_node: string | null
          requires_manual_review: boolean | null
          updated_at: string
          window_doors: string | null
          window_mechanism: string | null
          window_side: string | null
        }
        Insert: {
          created_at?: string
          door_material?: string | null
          door_placement?: string | null
          feed_product_type: string
          id?: string
          light_placement?: string | null
          light_type?: string | null
          mirror_folding?: boolean | null
          mirror_heated?: boolean | null
          mirror_position?: string | null
          mirror_turn_signal?: boolean | null
          product_id: string
          recommended_browse_node?: string | null
          requires_manual_review?: boolean | null
          updated_at?: string
          window_doors?: string | null
          window_mechanism?: string | null
          window_side?: string | null
        }
        Update: {
          created_at?: string
          door_material?: string | null
          door_placement?: string | null
          feed_product_type?: string
          id?: string
          light_placement?: string | null
          light_type?: string | null
          mirror_folding?: boolean | null
          mirror_heated?: boolean | null
          mirror_position?: string | null
          mirror_turn_signal?: boolean | null
          product_id?: string
          recommended_browse_node?: string | null
          requires_manual_review?: boolean | null
          updated_at?: string
          window_doors?: string | null
          window_mechanism?: string | null
          window_side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amazon_product_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "vauner_products"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_equivalences: {
        Row: {
          confidence_level: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          notes: string | null
          reference_brand: string
          updated_at: string
          vauner_brand: string
        }
        Insert: {
          confidence_level: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          notes?: string | null
          reference_brand: string
          updated_at?: string
          vauner_brand: string
        }
        Update: {
          confidence_level?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          reference_brand?: string
          updated_at?: string
          vauner_brand?: string
        }
        Relationships: []
      }
      category_config: {
        Row: {
          category_code: string
          category_name: string
          created_at: string
          enabled: boolean
          id: string
          updated_at: string
        }
        Insert: {
          category_code: string
          category_name: string
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          category_code?: string
          category_name?: string
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_equivalences: {
        Row: {
          confidence_level: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          notes: string | null
          reference_brand: string
          reference_model: string
          updated_at: string
          vauner_brand: string
          vauner_model: string
        }
        Insert: {
          confidence_level: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          notes?: string | null
          reference_brand: string
          reference_model: string
          updated_at?: string
          vauner_brand: string
          vauner_model: string
        }
        Update: {
          confidence_level?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          reference_brand?: string
          reference_model?: string
          updated_at?: string
          vauner_brand?: string
          vauner_model?: string
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          category: string
          created_at: string
          id: string
          margin_percentage: number
          shipping_cost: number
          updated_at: string
          vat_percentage: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          margin_percentage?: number
          shipping_cost?: number
          updated_at?: string
          vat_percentage?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          margin_percentage?: number
          shipping_cost?: number
          updated_at?: string
          vat_percentage?: number
        }
        Relationships: []
      }
      processing_queue: {
        Row: {
          batch_size: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          last_heartbeat: string | null
          last_product_id: string | null
          processed_count: number
          started_at: string | null
          status: string
          total_count: number
          updated_at: string
        }
        Insert: {
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          last_product_id?: string | null
          processed_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          last_product_id?: string | null
          processed_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      processing_recovery_log: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          products_remaining: number | null
          queue_id: string | null
          recovery_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          products_remaining?: number | null
          queue_id?: string | null
          recovery_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          products_remaining?: number | null
          queue_id?: string | null
          recovery_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_recovery_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "processing_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      vauner_config: {
        Row: {
          config_key: string
          config_value: string | null
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vauner_products: {
        Row: {
          año_desde: string | null
          año_hasta: string | null
          articulo: string | null
          bullet_points: string[] | null
          category: string | null
          created_at: string
          description: string
          has_image: boolean
          id: string
          marca: string | null
          modelo: string | null
          price: number
          processed_image_url: string | null
          raw_data: Json | null
          sku: string
          stock: number
          translated_title: string | null
          updated_at: string
        }
        Insert: {
          año_desde?: string | null
          año_hasta?: string | null
          articulo?: string | null
          bullet_points?: string[] | null
          category?: string | null
          created_at?: string
          description: string
          has_image?: boolean
          id?: string
          marca?: string | null
          modelo?: string | null
          price: number
          processed_image_url?: string | null
          raw_data?: Json | null
          sku: string
          stock?: number
          translated_title?: string | null
          updated_at?: string
        }
        Update: {
          año_desde?: string | null
          año_hasta?: string | null
          articulo?: string | null
          bullet_points?: string[] | null
          category?: string | null
          created_at?: string
          description?: string
          has_image?: boolean
          id?: string
          marca?: string | null
          modelo?: string | null
          price?: number
          processed_image_url?: string | null
          raw_data?: Json | null
          sku?: string
          stock?: number
          translated_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_models: {
        Row: {
          año_desde: string
          año_hasta: string | null
          created_at: string
          gama: string
          id: string
          id_gama: number
          id_marca: number
          marca: string
          updated_at: string
        }
        Insert: {
          año_desde: string
          año_hasta?: string | null
          created_at?: string
          gama: string
          id?: string
          id_gama: number
          id_marca: number
          marca: string
          updated_at?: string
        }
        Update: {
          año_desde?: string
          año_hasta?: string | null
          created_at?: string
          gama?: string
          id?: string
          id_gama?: number
          id_marca?: number
          marca?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
