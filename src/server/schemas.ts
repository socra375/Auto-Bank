import { z } from "zod";
import { CURRENCIES, parseMoney } from "@/lib/money";

const MAX_MINOR = 99_999_999_999_999n; // 999,999,999,999.99

const money = (allowZero: boolean) =>
  z
    .string({ error: "Ingresa un monto" })
    .transform((s, ctx) => {
      try {
        return parseMoney(s);
      } catch {
        ctx.addIssue({ code: "custom", message: "Monto inválido. Usa el formato 1,234.56 (máximo 2 decimales)." });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .bigint()
        .refine((v) => (allowZero ? v >= 0n : v > 0n), "El monto debe ser mayor que cero.")
        .refine((v) => v <= MAX_MINOR, "El monto es demasiado grande."),
    );

/** Positive amount typed by the user ("1,234.56") -> bigint minor units. */
export const amountSchema = money(false);
export const openingSchema = money(true);

export const currencySchema = z.enum(CURRENCIES, { error: "Moneda inválida (solo DOP o USD)." });
export const idSchema = z.uuid({ error: "Identificador inválido." });
export const dateSchema = z.iso.date({ error: "Fecha inválida." });
const name = (label: string) => z.string({ error: `${label} es obligatorio.` }).trim().min(1, `${label} es obligatorio.`).max(80);
const optText = (max: number) => z.string().trim().max(max).optional();
const description = z.string({ error: "La descripción es obligatoria." }).trim().min(1, "La descripción es obligatoria.").max(200);
const idempotencyKey = z.string().min(8).max(100).optional();

// ---- accounts / categories ------------------------------------------------
export const accountCreateSchema = z.object({
  name: name("El nombre"),
  type: z.enum(["cash", "bank", "savings", "digital"], { error: "Tipo de cuenta inválido." }),
  currency: currencySchema,
  openingBalance: openingSchema.default(0n),
  openingDate: dateSchema,
  description: optText(500),
});
export const accountEditSchema = z.object({ name: name("El nombre"), description: optText(500) });

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (usa #RRGGBB).").optional();
export const categoryCreateSchema = z.object({
  name: name("El nombre"),
  kind: z.enum(["income", "expense"], { error: "Tipo de categoría inválido." }),
  color,
});
export const categoryEditSchema = z.object({ name: name("El nombre"), color });

// ---- movements --------------------------------------------------------------
const common = { date: dateSchema, description, notes: optText(1000), idempotencyKey };
const flow = { ...common, accountId: idSchema, categoryId: idSchema, amount: amountSchema };

export const fxRateSchema = z
  .string({ error: "Tasa inválida." })
  .trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Tasa inválida (máximo 6 decimales).")
  .refine((s) => Number(s) > 0, "La tasa debe ser mayor que cero.");

export const movementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("income"), ...flow }),
  z.object({ type: z.literal("expense"), ...flow }),
  z.object({
    type: z.literal("transfer"), ...common,
    fromAccountId: idSchema, toAccountId: idSchema,
    amount: amountSchema, // amount leaving the origin account
    amountIn: amountSchema.optional(), // amount entering the destination (cross-currency only)
    fxRate: fxRateSchema.optional(),
  }),
  z.object({
    type: z.literal("adjustment"), ...common,
    accountId: idSchema, direction: z.enum(["increase", "decrease"], { error: "Dirección inválida." }), amount: amountSchema,
  }),
]);
export type MovementInput = z.input<typeof movementSchema>;
export type MovementType = z.infer<typeof movementSchema>["type"];

export const movementMetaSchema = z.object({ description, notes: optText(1000), categoryId: idSchema.optional() });

export const movementFiltersSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  types: z.array(z.enum(["income", "expense", "transfer", "adjustment", "reversal"])).optional(),
  accountId: idSchema.optional(),
  categoryId: idSchema.optional(),
  currency: currencySchema.optional(),
  status: z.enum(["posted", "reversed"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export type MovementFilters = z.input<typeof movementFiltersSchema>;

// ---- exchange rates ---------------------------------------------------------
export const rateSchema = z
  .object({ base: currencySchema, quote: currencySchema, rate: fxRateSchema, date: dateSchema })
  .refine((v) => v.base !== v.quote, { message: "La moneda base y la cotizada deben ser distintas.", path: ["quote"] });

// ---- loans ------------------------------------------------------------------
const directionSchema = z.enum(["receivable", "payable"], { error: "Tipo de préstamo inválido." });
const counterparty = z.string({ error: "La persona es obligatoria." }).trim().min(1, "La persona es obligatoria.").max(120);

export const loanCreateSchema = z
  .object({
    direction: directionSchema,
    counterparty,
    principal: amountSchema,
    currency: currencySchema,
    startDate: dateSchema,
    dueDate: dateSchema.optional(),
    /** Informational annual rate; real interest is whatever is recorded on payments. */
    interestRatePct: z.string().trim().regex(/^\d{1,3}(\.\d{1,4})?$/, "Tasa inválida (0 a 999.9999).").optional(),
    accountId: idSchema.optional(),
    funded: z.boolean().default(false),
    notes: optText(1000),
    idempotencyKey,
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.startDate, { message: "El vencimiento no puede ser anterior al inicio.", path: ["dueDate"] })
  .refine((v) => !v.funded || !!v.accountId, { message: "Selecciona la cuenta que mueve el dinero.", path: ["accountId"] });
export type LoanCreateInput = z.input<typeof loanCreateSchema>;

export const loanPaymentSchema = z
  .object({
    accountId: idSchema,
    date: dateSchema,
    principal: amountSchema.optional(),
    interest: amountSchema.optional(),
    notes: optText(1000),
    idempotencyKey,
  })
  .refine((v) => v.principal !== undefined || v.interest !== undefined, {
    message: "Indica el monto de capital y/o de interés.", path: ["principal"],
  });
export type LoanPaymentInput = z.input<typeof loanPaymentSchema>;

export const loanFiltersSchema = z.object({
  direction: directionSchema.optional(),
  status: z.enum(["pendiente", "parcial", "liquidado", "vencido"]).optional(),
  currency: currencySchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type LoanFilters = z.input<typeof loanFiltersSchema>;

// ---- assets (patrimonio) ----------------------------------------------------
export const ASSET_TYPES = ["real_estate", "vehicle", "technology", "furniture", "other"] as const;
export const assetTypeSchema = z.enum(ASSET_TYPES, { error: "Tipo de bien inválido." });
const assetName = z.string({ error: "El nombre es obligatorio." }).trim().min(1, "El nombre es obligatorio.").max(120);
const valueSchema = money(true); // a valuation may be 0 (total loss) but never negative

export const assetCreateSchema = z.object({
  name: assetName,
  type: assetTypeSchema,
  description: optText(1000),
  /** Fixed at creation; never editable. */
  currency: currencySchema,
  acquiredOn: dateSchema.optional(),
  acquisitionCost: openingSchema.optional(),
  initialValue: valueSchema,
  valuedOn: dateSchema,
  idempotencyKey,
});
export type AssetCreateInput = z.input<typeof assetCreateSchema>;

export const assetValuationSchema = z.object({
  value: valueSchema, valuedOn: dateSchema, source: optText(100), note: optText(1000), idempotencyKey,
});
export type AssetValuationInput = z.input<typeof assetValuationSchema>;

export const assetEditSchema = z.object({ name: assetName, description: optText(1000) });
export const assetDisposeSchema = z.object({ disposedOn: dateSchema, note: optText(1000) });

export const assetFiltersSchema = z.object({
  type: assetTypeSchema.optional(),
  status: z.enum(["active", "disposed"]).optional(),
  currency: currencySchema.optional(),
});
export type AssetFilters = z.input<typeof assetFiltersSchema>;
