import type { SupabaseClient } from "./supabase";
import type { MarketExpense, ExpenseType } from "../types/domain";

export interface UpsertMarketExpenseInput {
  region: string;
  city?: string | null;
  expenseType: ExpenseType;
  amountCents: number;
  effectiveDate: string; // ISO date string YYYY-MM-DD
}

export async function upsertMarketExpense(
  db: SupabaseClient,
  input: UpsertMarketExpenseInput,
): Promise<MarketExpense> {
  const { data, error } = await db
    .from("market_expenses")
    .upsert(
      {
        region: input.region,
        city: input.city ?? null,
        expense_type: input.expenseType,
        amount_cents: input.amountCents,
        effective_date: input.effectiveDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "region,expense_type,city,effective_date" },
    )
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("upsertMarketExpense: no row returned");
  return mapExpense(data);
}

// Returns all expenses for region, ordered by effective_date DESC.
export async function getMarketExpensesByRegion(
  db: SupabaseClient,
  region: string,
): Promise<MarketExpense[]> {
  const { data, error } = await db
    .from("market_expenses")
    .select()
    .eq("region", region)
    .order("effective_date", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapExpense);
}

function mapExpense(row: Record<string, unknown>): MarketExpense {
  return {
    id: row.id as string,
    region: row.region as string,
    city: (row.city as string | null) ?? null,
    expenseType: row.expense_type as ExpenseType,
    amountCents: row.amount_cents as number,
    effectiveDate: row.effective_date as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
