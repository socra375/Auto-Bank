"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, FieldGroup, inputCls } from "@/components/ui/fields";
import type { ActionState } from "@/lib/actions/guarded";

export type FormAccount = { id: string; name: string; currency: "DOP" | "USD" };
export type FormCategory = { id: string; name: string; kind: "income" | "expense" };
export type MovementType = "income" | "expense" | "transfer" | "adjustment";
export type MovementInitial = {
  type: MovementType; date: string; description: string; notes?: string; accountId?: string; categoryId?: string;
  fromAccountId?: string; toAccountId?: string; amount?: string; amountIn?: string; fxRate?: string; direction?: "increase" | "decrease";
};

const TYPES: { value: MovementType; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
  { value: "adjustment", label: "Ajuste de saldo" },
];

/** Create (quick-add) and correct (reversal + repost) share this form; the type selector is hidden when `type` is fixed. */
export function MovementForm({
  action, accounts, categories, today, type: fixedType, initial, idempotencyKey, submit = "Guardar movimiento", idp = "mf",
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  accounts: FormAccount[]; categories: FormCategory[]; today: string;
  type?: MovementType; initial?: MovementInitial; idempotencyKey?: string; submit?: string; idp?: string;
}) {
  const [type, setType] = useState<MovementType>(fixedType ?? initial?.type ?? "expense");
  const [from, setFrom] = useState(initial?.fromAccountId ?? accounts[0]?.id ?? "");
  const [to, setTo] = useState(initial?.toAccountId ?? accounts[1]?.id ?? accounts[0]?.id ?? "");
  const cur = (id: string) => accounts.find((a) => a.id === id)?.currency;
  const cross = type === "transfer" && !!cur(from) && !!cur(to) && cur(from) !== cur(to);
  const id = (n: string) => `${idp}-${n}`;
  const acctOptions = accounts.map((a) => <option key={a.id} value={a.id}>{`${a.name} (${a.currency})`}</option>);
  const cats = categories.filter((c) => c.kind === type);

  return (
    <ActionForm action={action} submit={submit}>
      {idempotencyKey && <input type="hidden" name="idempotencyKey" value={idempotencyKey} />}
      {fixedType ? (
        <input type="hidden" name="type" value={fixedType} />
      ) : (
        <Field label="Tipo" id={id("type")}>
          <select id={id("type")} name="type" value={type} onChange={(e) => setType(e.target.value as MovementType)} className={inputCls}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
      )}

      <FieldGroup legend="Detalle">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha" id={id("date")}>
          <input id={id("date")} name="date" type="date" required defaultValue={initial?.date ?? today} className={inputCls} />
        </Field>
        <Field label="Descripción" id={id("description")}>
          <input id={id("description")} name="description" required maxLength={200} autoComplete="off" enterKeyHint="next" defaultValue={initial?.description} className={inputCls} />
        </Field>

      </div>
      </FieldGroup>
      <FieldGroup legend={type === "transfer" ? "Transferencia" : "Cuenta y monto"}>
      <div className="grid gap-4 sm:grid-cols-2">
        {type === "transfer" ? (
          <>
            <Field label="Cuenta de origen" id={id("from")}>
              <select id={id("from")} name="fromAccountId" required value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>{acctOptions}</select>
            </Field>
            <Field label="Cuenta de destino" id={id("to")}>
              <select id={id("to")} name="toAccountId" required value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}>{acctOptions}</select>
            </Field>
            <Field label={`Monto enviado${cur(from) ? ` (${cur(from)})` : ""}`} id={id("amount")}>
              <input id={id("amount")} name="amount" required inputMode="decimal" enterKeyHint="next" pattern="(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?" title="Usa solo números con hasta 2 decimales. Ej.: 1250.50" autoComplete="off" placeholder="0.00" defaultValue={initial?.amount} className={inputCls} />
            </Field>
            {cross && (
              <>
                <Field label={`Monto recibido (${cur(to)})`} id={id("amountIn")} hint="Escribe el monto real recibido; no se calcula automáticamente.">
                  <input id={id("amountIn")} name="amountIn" required inputMode="decimal" enterKeyHint="next" pattern="(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?" title="Usa solo números con hasta 2 decimales. Ej.: 1250.50" autoComplete="off" placeholder="0.00" defaultValue={initial?.amountIn} aria-describedby={`${id("amountIn")}-hint`} className={inputCls} />
                </Field>
                <Field label="Tasa de cambio aplicada" id={id("fxRate")} hint="Obligatoria entre monedas distintas (hasta 6 decimales).">
                  <input id={id("fxRate")} name="fxRate" required inputMode="decimal" enterKeyHint="next" pattern="\d+(\.\d{1,6})?" title="Usa solo números con hasta 6 decimales. Ej.: 59.250000" autoComplete="off" placeholder="59.000000" defaultValue={initial?.fxRate} aria-describedby={`${id("fxRate")}-hint`} className={inputCls} />
                </Field>
              </>
            )}
          </>
        ) : (
          <>
            <Field label="Cuenta" id={id("account")}>
              <select id={id("account")} name="accountId" required defaultValue={initial?.accountId ?? accounts[0]?.id} className={inputCls}>{acctOptions}</select>
            </Field>
            {type === "adjustment" ? (
              <Field label="Ajuste" id={id("direction")}>
                <select id={id("direction")} name="direction" defaultValue={initial?.direction ?? "increase"} className={inputCls}>
                  <option value="increase">Aumentar saldo</option>
                  <option value="decrease">Disminuir saldo</option>
                </select>
              </Field>
            ) : (
              <Field label="Categoría" id={id("category")}>
                <select id={id("category")} name="categoryId" required defaultValue={initial?.categoryId ?? ""} className={inputCls}>
                  <option value="" disabled>Selecciona…</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Monto" id={id("amount")} hint="Siempre positivo; el signo lo define el tipo.">
              <input id={id("amount")} name="amount" required inputMode="decimal" enterKeyHint="next" pattern="(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?" title="Usa solo números con hasta 2 decimales. Ej.: 1250.50" autoComplete="off" placeholder="0.00" defaultValue={initial?.amount} aria-describedby={`${id("amount")}-hint`} className={inputCls} />
            </Field>
          </>
        )}
      </div>
      </FieldGroup>
      <Field label="Notas (opcional)" id={id("notes")}>
        <textarea id={id("notes")} name="notes" rows={2} maxLength={1000} defaultValue={initial?.notes} className={inputCls} />
      </Field>
    </ActionForm>
  );
}
