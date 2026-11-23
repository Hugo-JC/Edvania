import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {buildCsvDocument, parseDateRangeFilters} from "@/lib/reports-csv";
import {createRouteClient} from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const {supabase} = await createRouteClient(request);
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({error: "unauthorized"}, {status: 401});
  }

  const storeId = request.nextUrl.searchParams.get("store") ?? "";
  if (!z.string().uuid().safeParse(storeId).success) {
    return NextResponse.json({error: "invalid_store"}, {status: 400});
  }

  const {data: membership} = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
    return NextResponse.json({error: "forbidden"}, {status: 403});
  }

  const {fromDate, toDate, fromIso, toIso} = parseDateRangeFilters(
    request.nextUrl.searchParams.get("from"),
    request.nextUrl.searchParams.get("to"),
  );

  let salesQuery = supabase
    .from("sales")
    .select("sale_number,total,status,sold_at")
    .eq("store_id", storeId)
    .eq("status", "confirmed")
    .order("sold_at", {ascending: false})
    .limit(500);
  if (fromIso) salesQuery = salesQuery.gte("sold_at", fromIso);
  if (toIso) salesQuery = salesQuery.lte("sold_at", toIso);

  let purchasesQuery = supabase
    .from("purchases")
    .select("purchase_number,total,status,received_at")
    .eq("store_id", storeId)
    .eq("status", "received")
    .order("received_at", {ascending: false})
    .limit(500);
  if (fromIso) purchasesQuery = purchasesQuery.gte("received_at", fromIso);
  if (toIso) purchasesQuery = purchasesQuery.lte("received_at", toIso);

  let expensesQuery = supabase
    .from("expenses")
    .select("category,description,amount,created_at")
    .eq("store_id", storeId)
    .order("created_at", {ascending: false})
    .limit(500);
  if (fromIso) expensesQuery = expensesQuery.gte("created_at", fromIso);
  if (toIso) expensesQuery = expensesQuery.lte("created_at", toIso);

  const [{data: sales}, {data: purchases}, {data: expenses}] = await Promise.all([
    salesQuery,
    purchasesQuery,
    expensesQuery,
  ]);

  const rows: (readonly unknown[])[] = [];
  for (const s of sales ?? []) {
    rows.push(["Venda", `#${s.sale_number}`, "Venda confirmada", Number(s.total ?? 0).toFixed(2), "AOA", s.sold_at]);
  }
  for (const p of purchases ?? []) {
    rows.push(["Compra", `#${p.purchase_number}`, "Compra recebida", (-Number(p.total ?? 0)).toFixed(2), "AOA", p.received_at]);
  }
  for (const e of expenses ?? []) {
    rows.push(["Despesa", e.category ?? "geral", e.description, (-Number(e.amount ?? 0)).toFixed(2), "AOA", e.created_at]);
  }

  const csv = buildCsvDocument(
    ["Tipo", "Referência", "Descrição", "Valor", "Moeda", "Data"],
    rows,
  );
  const rangeLabel = fromDate || toDate ? `_${fromDate || "inicio"}_${toDate || "fim"}` : "";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="edvania_relatorio${rangeLabel}.csv"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
