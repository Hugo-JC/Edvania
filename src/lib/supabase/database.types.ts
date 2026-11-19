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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_usage_logs: {
        Row: {
          completion_tokens: number | null
          created_at: string
          estimated_cost: number | null
          id: string
          latency_ms: number | null
          model: string
          prompt_tokens: number | null
          provider: string
          status_code: number | null
          store_id: string | null
          success: boolean
          task_type: string | null
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          latency_ms?: number | null
          model: string
          prompt_tokens?: number | null
          provider: string
          status_code?: number | null
          store_id?: string | null
          success?: boolean
          task_type?: string | null
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          latency_ms?: number | null
          model?: string
          prompt_tokens?: number | null
          provider?: string
          status_code?: number | null
          store_id?: string | null
          success?: boolean
          task_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      angola_municipalities: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          province_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          province_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          province_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "angola_municipalities_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "angola_provinces"
            referencedColumns: ["id"]
          },
        ]
      }
      angola_provinces: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          request_id: string | null
          store_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          request_id?: string | null
          store_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          request_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          store_id: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          store_id: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          store_id?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      baileys_auth_state: {
        Row: {
          connection_id: string
          encrypted_data: string
          encryption_key_version: string
          id: string
          key_id: string
          key_type: string
          session_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          encrypted_data: string
          encryption_key_version: string
          id?: string
          key_id: string
          key_type: string
          session_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          encrypted_data?: string
          encryption_key_version?: string
          id?: string
          key_id?: string
          key_type?: string
          session_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baileys_auth_state_store_id_connection_id_fkey"
            columns: ["store_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "baileys_auth_state_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          direction: string
          id: string
          movement_type: string
          reference_id: string | null
          reference_type: string | null
          session_id: string
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: string
          id?: string
          movement_type: string
          reference_id?: string | null
          reference_type?: string | null
          session_id: string
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          id?: string
          movement_type?: string
          reference_id?: string | null
          reference_type?: string | null
          session_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_store_id_session_id_fkey"
            columns: ["store_id", "session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          name: string
          status: Database["public"]["Enums"]["record_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_store_id_location_id_fkey"
            columns: ["store_id", "location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          difference_amount: number | null
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          register_id: string
          store_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          difference_amount?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_amount?: number
          register_id: string
          store_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          difference_amount?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          register_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_store_id_register_id_fkey"
            columns: ["store_id", "register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_store_id_parent_id_fkey"
            columns: ["store_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone_e164: string | null
          status: Database["public"]["Enums"]["record_status"]
          store_id: string
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone_e164?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id: string
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone_e164?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id?: string
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          description: string
          id: string
          incurred_at: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description: string
          id?: string
          incurred_at?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string
          id?: string
          incurred_at?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          status: Database["public"]["Enums"]["record_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          product_id: string
          quantity_delta: number
          reference_id: string | null
          reference_type: string | null
          store_id: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          product_id: string
          quantity_delta: number
          reference_id?: string | null
          reference_type?: string | null
          store_id: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          product_id?: string
          quantity_delta?: number
          reference_id?: string | null
          reference_type?: string | null
          store_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_location_id_fkey"
            columns: ["store_id", "location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          external_reference: string | null
          id: string
          metadata: Json
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string | null
          sale_id: string
          status: Database["public"]["Enums"]["payment_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code?: string
          external_reference?: string | null
          id?: string
          metadata?: Json
          method: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          sale_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          external_reference?: string | null
          id?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          sale_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_store_id_sale_id_fkey"
            columns: ["store_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          metadata: Json
          min_stock: number
          name: string
          sale_price: number
          sku: string | null
          status: Database["public"]["Enums"]["record_status"]
          store_id: string
          track_stock: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          min_stock?: number
          name: string
          sale_price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id: string
          track_stock?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          min_stock?: number
          name?: string
          sale_price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id?: string
          track_stock?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_category_id_fkey"
            columns: ["store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      proxypay_payments: {
        Row: {
          amount_aoa: number
          created_at: string
          entity_id: string | null
          expiry_date: string | null
          fee: number
          id: string
          payment_id: string
          provider_flow: string
          provider_payload: Json
          proxypay_payment_id: string | null
          reference_number: string | null
          status: Database["public"]["Enums"]["payment_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          amount_aoa: number
          created_at?: string
          entity_id?: string | null
          expiry_date?: string | null
          fee?: number
          id?: string
          payment_id: string
          provider_flow: string
          provider_payload?: Json
          proxypay_payment_id?: string | null
          reference_number?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          amount_aoa?: number
          created_at?: string
          entity_id?: string | null
          expiry_date?: string | null
          fee?: number
          id?: string
          payment_id?: string
          provider_flow?: string
          provider_payload?: Json
          proxypay_payment_id?: string | null
          reference_number?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proxypay_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxypay_payments_store_id_payment_id_fkey"
            columns: ["store_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          sku: string | null
          store_id: string
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          line_total: number
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id: string
          sku?: string | null
          store_id: string
          tax_rate?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          sku?: string | null
          store_id?: string
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "sale_items_store_id_sale_id_fkey"
            columns: ["store_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_total: number
          id: string
          notes: string | null
          sale_number: number
          sold_at: string | null
          status: Database["public"]["Enums"]["sale_status"]
          store_id: string
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_total?: number
          id?: string
          notes?: string | null
          sale_number?: number
          sold_at?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          store_id: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_total?: number
          id?: string
          notes?: string | null
          sale_number?: number
          sold_at?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          store_id?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_store_id_customer_id_fkey"
            columns: ["store_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role: Database["public"]["Enums"]["store_role"]
          status: Database["public"]["Enums"]["record_status"]
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["store_role"]
          status?: Database["public"]["Enums"]["record_status"]
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["store_role"]
          status?: Database["public"]["Enums"]["record_status"]
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_memberships_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          created_at: string
          created_by: string
          currency_code: string
          email: string | null
          id: string
          legal_name: string | null
          locale: string
          municipality_id: string | null
          name: string
          phone_e164: string | null
          province_id: string | null
          settings: Json
          status: Database["public"]["Enums"]["record_status"]
          tax_number: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by: string
          currency_code?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          locale?: string
          municipality_id?: string | null
          name: string
          phone_e164?: string | null
          province_id?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["record_status"]
          tax_number?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          locale?: string
          municipality_id?: string | null
          name?: string
          phone_e164?: string | null
          province_id?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["record_status"]
          tax_number?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_municipality_fk"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "angola_municipalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_province_fk"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "angola_provinces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone_e164: string | null
          status: Database["public"]["Enums"]["record_status"]
          store_id: string
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone_e164?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id: string
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone_e164?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          store_id?: string
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone_e164: string | null
          preferred_locale: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone_e164?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone_e164?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          attempts: number
          external_event_id: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          signature_valid: boolean
          source: string
          status: string
        }
        Insert: {
          attempts?: number
          external_event_id: string
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          signature_valid?: boolean
          source: string
          status?: string
        }
        Update: {
          attempts?: number
          external_event_id?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          signature_valid?: boolean
          source?: string
          status?: string
        }
        Relationships: []
      }
      whatsapp_connections: {
        Row: {
          connection_status: string
          created_at: string
          id: string
          last_connected_at: string | null
          metadata: Json
          phone_e164: string | null
          provider: string
          store_id: string
          updated_at: string
        }
        Insert: {
          connection_status?: string
          created_at?: string
          id?: string
          last_connected_at?: string | null
          metadata?: Json
          phone_e164?: string | null
          provider?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          connection_status?: string
          created_at?: string
          id?: string
          last_connected_at?: string | null
          metadata?: Json
          phone_e164?: string | null
          provider?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          contact_name: string | null
          created_at: string
          customer_id: string | null
          id: string
          last_message_at: string | null
          metadata: Json
          store_id: string
          updated_at: string
          wa_contact: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json
          store_id: string
          updated_at?: string
          wa_contact: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json
          store_id?: string
          updated_at?: string
          wa_contact?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_store_id_customer_id_fkey"
            columns: ["store_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          delivery_status: string
          direction: string
          external_message_id: string | null
          id: string
          media_storage_path: string | null
          message_type: string
          sent_at: string | null
          store_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          delivery_status?: string
          direction: string
          external_message_id?: string | null
          id?: string
          media_storage_path?: string | null
          message_type?: string
          sent_at?: string | null
          store_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivery_status?: string
          direction?: string
          external_message_id?: string | null
          id?: string
          media_storage_path?: string | null
          message_type?: string
          sent_at?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_store_id_conversation_id_fkey"
            columns: ["store_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "whatsapp_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_balances: {
        Row: {
          location_id: string | null
          product_id: string | null
          quantity_on_hand: number | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_location_id_fkey"
            columns: ["store_id", "location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_product_id_fkey"
            columns: ["store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
    }
    Functions: {
      has_store_access: { Args: { p_store_id: string }; Returns: boolean }
      has_store_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["store_role"][]
          p_store_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      payment_method:
        | "cash"
        | "bank_transfer"
        | "multicaixa_reference"
        | "multicaixa_express"
        | "other"
      payment_status:
        | "pending"
        | "confirmed"
        | "failed"
        | "cancelled"
        | "refunded"
      record_status: "active" | "inactive" | "archived"
      sale_status: "draft" | "confirmed" | "cancelled" | "refunded"
      stock_movement_type:
        | "opening"
        | "purchase"
        | "sale"
        | "adjustment"
        | "return_in"
        | "return_out"
        | "transfer_in"
        | "transfer_out"
      store_role: "owner" | "admin" | "manager" | "employee"
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
  public: {
    Enums: {
      payment_method: [
        "cash",
        "bank_transfer",
        "multicaixa_reference",
        "multicaixa_express",
        "other",
      ],
      payment_status: [
        "pending",
        "confirmed",
        "failed",
        "cancelled",
        "refunded",
      ],
      record_status: ["active", "inactive", "archived"],
      sale_status: ["draft", "confirmed", "cancelled", "refunded"],
      stock_movement_type: [
        "opening",
        "purchase",
        "sale",
        "adjustment",
        "return_in",
        "return_out",
        "transfer_in",
        "transfer_out",
      ],
      store_role: ["owner", "admin", "manager", "employee"],
    },
  },
} as const

