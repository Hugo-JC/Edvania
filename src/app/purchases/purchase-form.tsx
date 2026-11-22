"use client";

import { useRef, useState } from "react";
import { createPurchase } from "./actions";

type Product = { id: string; name: string; sku: string | null; cost_price: number | string; unit: string; track_stock: boolean };
type Supplier = { id: string; name: string };
type Props = { idempotencyKey: string; products: Product[]; storeId: string; suppliers: Supplier[] };
const money = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 });

export function PurchaseForm({ idempotencyKey, products, storeId, suppliers }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState<{ items: { name: string; quantity: number; total: number }[]; total: number } | null>(null);

  function review() {
    const values = formRef.current ? new FormData(formRef.current) : null;
    if (!values) return;
    const items = products.flatMap((product) => {
      const quantity = Number(values.get(`quantity_${product.id}`));
      const unitCost = Number(values.get(`unitCost_${product.id}`));
      return Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitCost) && unitCost >= 0
        ? [{ name: product.name, quantity, total: quantity * unitCost }]
        : [];
    });
    if (!items.length) { setSummary(null); setConfirmed(false); return; }
    setSummary({ items, total: items.reduce((total, item) => total + item.total, 0) });
    setConfirmed(true);
  }

  return (
    <form className="form product-form" action={createPurchase} onChange={() => setConfirmed(false)} onInput={() => setConfirmed(false)} ref={formRef}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="form-grid">
        <label>Fornecedor (opcional)<select name="supplierId" defaultValue=""><option value="">Sem fornecedor associado</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <label>Referência da factura / guia<input name="supplierReference" maxLength={120} placeholder="Ex.: FT 2026/001" /></label>
      </div>

      {/* Mobile-first responsive product rows */}
      <div className="divide-y divide-[#E2E7E3] border-y border-[#E2E7E3]">
        <div className="hidden sm:grid sm:grid-cols-12 sm:gap-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[#4B5952]">
          <span className="col-span-5">Produto</span>
          <span className="col-span-1">Un.</span>
          <span className="col-span-3">Custo unitário (AOA)</span>
          <span className="col-span-3">Quantidade recebida</span>
        </div>
        {products.map((product) => (
          <div
            key={product.id}
            className="grid grid-cols-1 gap-3 py-3.5 sm:grid-cols-12 sm:items-center"
          >
            <div className="sm:col-span-5">
              <strong className="block text-[14.5px] text-[#15201C]">{product.name}</strong>
              <small className="text-[12.5px] text-[#4B5952]">
                {product.sku || (product.track_stock ? "Controla stock" : "Sem controlo de stock")}
              </small>
            </div>
            <div className="hidden sm:block sm:col-span-1 text-[13.5px] text-[#4B5952]">
              {product.unit}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <label className="!gap-1 !text-[12.5px] sm:col-span-3 sm:[&>span]:sr-only">
                <span>Custo ({product.unit})</span>
                <input
                  aria-label={`Custo unitário de ${product.name}`}
                  name={`unitCost_${product.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={Number(product.cost_price)}
                  className="tabular"
                />
              </label>
              <label className="!gap-1 !text-[12.5px] sm:col-span-3 sm:[&>span]:sr-only">
                <span>Quantidade ({product.unit})</span>
                <input
                  aria-label={`Quantidade recebida de ${product.name}`}
                  name={`quantity_${product.id}`}
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue="0"
                  className="tabular"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {!products.length && <p className="muted">Adiciona produtos ao catálogo antes de registar uma compra.</p>}
      <label>Observações<input name="notes" maxLength={500} /></label>
      {!confirmed ? (
        <div>
          <button className="primary-button" type="button" disabled={!products.length} onClick={review}>Rever compra</button>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-[#EAF4F0] p-5" aria-live="polite">
            <h3>Confirmação necessária</h3>
            {summary?.items.map((item) => <p key={item.name} className="tabular">{item.name}: {item.quantity} — {money.format(item.total)}</p>)}
            <p className="tabular"><strong>Total: {money.format(summary?.total ?? 0)}</strong></p>
            <p className="muted">Confirma que a mercadoria foi recebida. O servidor valida novamente fornecedores, produtos, permissões e totais.</p>
          </div>
          <div>
            <button className="primary-button" type="submit">Confirmar compra e entrada no stock</button>
          </div>
        </>
      )}
    </form>
  );
}
