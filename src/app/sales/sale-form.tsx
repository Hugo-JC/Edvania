"use client";

import { useRef, useState } from "react";
import { createSale } from "./actions";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  sale_price: number | string;
  unit: string;
  track_stock: boolean;
  stock: number;
};

type Customer = { id: string; name: string };

type Props = {
  customers: Customer[];
  idempotencyKey: string;
  products: Product[];
  storeId: string;
};

const money = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 });

export function SaleForm({ customers, idempotencyKey, products, storeId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState<{ items: { name: string; quantity: number; total: number }[]; total: number; paid: number } | null>(null);

  function review() {
    const form = formRef.current;
    if (!form) return;
    const values = new FormData(form);
    const items = products.flatMap((product) => {
      const quantity = Number(values.get(`quantity_${product.id}`));
      return Number.isFinite(quantity) && quantity > 0
        ? [{ name: product.name, quantity, total: quantity * Number(product.sale_price) }]
        : [];
    });
    const paid = Number(values.get("paidAmount"));
    if (!items.length || !Number.isFinite(paid) || paid < 0) {
      setSummary(null);
      setConfirmed(false);
      return;
    }
    setSummary({ items, total: items.reduce((total, item) => total + item.total, 0), paid });
    setConfirmed(true);
  }

  return (
    <form className="form product-form" action={createSale} onChange={() => setConfirmed(false)} onInput={() => setConfirmed(false)} ref={formRef}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {/* Mobile-first single-DOM responsive product list (no horizontal table scroll needed) */}
      <div className="divide-y divide-[#E2E7E3] border-y border-[#E2E7E3]">
        <div className="hidden sm:grid sm:grid-cols-12 sm:gap-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[#4B5952]">
          <span className="col-span-5">Produto</span>
          <span className="col-span-3">Preço unitário</span>
          <span className="col-span-2">Stock</span>
          <span className="col-span-2">Quantidade</span>
        </div>
        {products.map((product) => (
          <div
            key={product.id}
            className="grid grid-cols-1 gap-3 py-3.5 sm:grid-cols-12 sm:items-center"
          >
            <div className="sm:col-span-5">
              <strong className="block text-[14.5px] text-[#15201C]">{product.name}</strong>
              <small className="text-[12.5px] text-[#4B5952]">{product.sku || product.unit}</small>
            </div>
            <div className="flex items-center justify-between gap-3 text-[13.5px] sm:contents">
              <span className="tabular font-medium text-[#15201C] sm:col-span-3">
                {money.format(Number(product.sale_price))}
              </span>
              <span className="tabular text-[#4B5952] sm:col-span-2">
                {product.track_stock ? `${product.stock} ${product.unit}` : "Livre"}
              </span>
            </div>
            <div className="sm:col-span-2">
              <label className="!gap-1 !text-[12.5px] sm:[&>span]:sr-only">
                <span>Quantidade ({product.unit})</span>
                <input
                  aria-label={`Quantidade de ${product.name}`}
                  name={`quantity_${product.id}`}
                  type="number"
                  min="0"
                  max={product.track_stock ? product.stock : undefined}
                  step="0.001"
                  defaultValue="0"
                  className="tabular"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {!products.length && <p className="muted">Adiciona produtos ao catálogo antes de registar vendas.</p>}
      <label>Cliente (opcional)
        <select name="customerId" defaultValue=""><option value="">Venda sem cliente associado</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
      </label>
      <div className="form-grid">
        <label>Forma de pagamento
          <select name="paymentMethod" defaultValue="cash"><option value="cash">Numerário</option><option value="bank_transfer">Transferência bancária</option><option value="multicaixa_reference">Referência Multicaixa</option><option value="multicaixa_express">Multicaixa Express</option><option value="other">Outro</option></select>
        </label>
        <label>Valor recebido (AOA)<input name="paidAmount" type="number" min="0" step="0.01" defaultValue="0" required /></label>
      </div>
      <label>Observações<input name="notes" maxLength={500} /></label>
      {!confirmed ? (
        <div>
          <button className="primary-button" type="button" disabled={!products.length} onClick={review}>Rever venda</button>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-[#EAF4F0] p-5" aria-live="polite">
            <h3>Confirmação necessária</h3>
            {summary?.items.map((item) => <p key={item.name} className="tabular">{item.name}: {item.quantity} — {money.format(item.total)}</p>)}
            <p className="tabular"><strong>Total: {money.format(summary?.total ?? 0)}</strong></p>
            <p className="tabular">Recebido: {money.format(summary?.paid ?? 0)} · Em falta: {money.format(Math.max(0, (summary?.total ?? 0) - (summary?.paid ?? 0)))}</p>
            <p className="muted">Confirma que o resumo está correcto. O servidor valida novamente preços, stock, permissões e totais.</p>
          </div>
          <div>
            <button className="primary-button" type="submit">Confirmar e registar venda</button>
          </div>
        </>
      )}
    </form>
  );
}
