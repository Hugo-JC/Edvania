"use client";

import { useRef, useState } from "react";
import { closeCashSession, openCashSession, recordCashExpense, recordCashMovement } from "./actions";

type Register = { id: string; name: string };
type OpenSession = { id: string; register_id: string; opening_amount: number | string; opened_at: string };

const money = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 });

export function OpenCashForm({
  storeId,
  registers,
  idempotencyKey,
}: {
  storeId: string;
  registers: Register[];
  idempotencyKey: string;
}) {
  return (
    <form className="form" action={openCashSession}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="form-grid">
        <label>
          Caixa
          <select name="registerId" required defaultValue={registers[0]?.id ?? ""}>
            {registers.map((register) => (
              <option key={register.id} value={register.id}>{register.name}</option>
            ))}
          </select>
        </label>
        <label>
          Saldo de abertura (AOA)
          <input name="openingAmount" type="number" min="0" step="0.01" defaultValue="0" required />
        </label>
      </div>
      <label>
        Observações
        <input name="notes" maxLength={500} placeholder="Ex.: Fundo de maneio inicial" />
      </label>
      <button className="primary-button" type="submit" disabled={!registers.length}>
        Abrir sessão de caixa
      </button>
    </form>
  );
}

export function CashMovementAndCloseForms({
  storeId,
  session,
  registerName,
  movementKey,
  expenseKey,
  closeKey,
}: {
  storeId: string;
  session: OpenSession;
  registerName: string;
  movementKey: string;
  expenseKey: string;
  closeKey: string;
}) {
  const closeRef = useRef<HTMLFormElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [countedPreview, setCountedPreview] = useState<number | null>(null);

  function reviewClose() {
    const raw = closeRef.current ? new FormData(closeRef.current).get("countedAmount") : null;
    const counted = Number(raw);
    if (!Number.isFinite(counted) || counted < 0) {
      setConfirmClose(false);
      setCountedPreview(null);
      return;
    }
    setCountedPreview(counted);
    setConfirmClose(true);
  }

  return (
    <>
      <section className="panel-card">
        <div className="section-heading">
          <h2>Movimento de caixa</h2>
          <span>{registerName} · Aberta com {money.format(Number(session.opening_amount))}</span>
        </div>
        <form className="form" action={recordCashMovement}>
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="idempotencyKey" value={movementKey} />
          <div className="form-grid">
            <label>
              Tipo de movimento
              <select name="type" defaultValue="deposit">
                <option value="deposit">Reforço / Depósito</option>
                <option value="withdrawal">Levantamento / Sangria</option>
                <option value="adjustment">Ajuste de caixa</option>
              </select>
            </label>
            <label>
              Direcção
              <select name="direction" defaultValue="in">
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Valor (AOA)
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </label>
            <label>
              Descrição
              <input name="description" required maxLength={500} placeholder="Ex.: Troco ou sangria" />
            </label>
          </div>
          <button className="primary-button" type="submit">Registar movimento</button>
        </form>
      </section>

      <section className="panel-card">
        <h2>Registar despesa operacional</h2>
        <form className="form" action={recordCashExpense}>
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="idempotencyKey" value={expenseKey} />
          <div className="form-grid">
            <label>
              Descrição da despesa
              <input name="description" required maxLength={500} placeholder="Ex.: Transporte de mercadoria" />
            </label>
            <label>
              Categoria (opcional)
              <input name="category" maxLength={100} placeholder="Ex.: Logística" />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Valor (AOA)
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </label>
            <label>
              Notas
              <input name="notes" maxLength={500} />
            </label>
          </div>
          <button className="quiet-button" type="submit">Registar despesa</button>
        </form>
      </section>

      <section className="panel-card">
        <h2>Fechar sessão de caixa</h2>
        <form
          className="form"
          action={closeCashSession}
          ref={closeRef}
          onChange={() => setConfirmClose(false)}
          onInput={() => setConfirmClose(false)}
        >
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="idempotencyKey" value={closeKey} />
          <div className="form-grid">
            <label>
              Valor contado em caixa (AOA)
              <input name="countedAmount" type="number" min="0" step="0.01" required defaultValue="0" />
            </label>
            <label>
              Observações de fecho
              <input name="notes" maxLength={500} placeholder="Ex.: Contagem conferida ao fim do turno" />
            </label>
          </div>
          {!confirmClose ? (
            <button className="quiet-button" type="button" onClick={reviewClose}>
              Rever fecho de caixa
            </button>
          ) : (
            <>
              <section className="panel-card" aria-live="polite">
                <h3>Confirmação necessária</h3>
                <p><strong>Caixa: {registerName}</strong></p>
                <p>Valor contado declarado: {money.format(countedPreview ?? 0)}</p>
                <p className="muted">O servidor calcula o saldo esperado e a diferença de reconciliação na mesma transacção auditada.</p>
              </section>
              <button className="primary-button" type="submit">Confirmar e fechar sessão</button>
            </>
          )}
        </form>
      </section>
    </>
  );
}
